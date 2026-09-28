/**
 * Level System persistence: run tickets, lives, per-level progress and XP
 * (design/xp-and-levels.md §5, §9).
 *
 * Trust: levels have NO replay verification (Leeran, 2026-09-27). The run
 * result (cleared, stars, ticks) is the device's report, sanity-checked
 * (rules.ts parseReportedRun, runFitsWallClock) but not proven, so a
 * modified client can claim clears and stars. What stays server-derived:
 * which level a result counts for (the ticket row), unlocks (one level past
 * the highest recorded clear), lives (stored count + server clock), and that
 * each ticket, life refund and XP key is used once. Levels carry no prizes;
 * anything that does must not build on these rows.
 *
 * Concurrency: every write takes the user's row lock first
 * (SELECT ... FOR UPDATE, as src/db/chips.ts does), so one player's ticket
 * issues and result submits are serialized. On top of that, a ticket is
 * consumed with UPDATE ... WHERE used_at IS NULL, and the life is refunded
 * only when that update touched the row, so two submits of the same ticket
 * can never both refund a life or pay XP. XP is paid through xp_grants rows
 * unique on (user, source, key) and users.xp rises only by rows inserted.
 */

import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";

import { prisma } from "./client";
import { levelBoosterTypes } from "../levels/catalog";
import {
  LEVELS_PER_SEASON,
  MAX_LIVES,
  episodeLevels,
  episodeOf,
  frontierAfter,
  isBadStart,
  isQuickRestart,
  levelCostsLife,
  nextLifeAt,
  playerLevelForXp,
  playerLevelProgress,
  refillLives,
  refundLife,
  spendLife,
  xpAwardsForClear,
  runFitsWallClock,
  type LifeState,
  type ReportedRun,
} from "../levels/rules";
import {
  boosterInventory,
  chestProgress,
  chestsEarned,
  failsAt,
  freeStartPowerUp,
  nextFailTally,
  nextStreak,
  parseBoosterType,
  routeGhostAvailable,
  type BoosterInventory,
  type BoosterType,
  type FailTally,
  type StartPowerUp,
  type TicketOutcome,
} from "../levels/engagement";
import { rollStarChest } from "../levels/starChestServer";

type TxClient = Prisma.TransactionClient;

/** A ticket is valid for 24 h, so a crashed run can still be submitted. */
export const LEVEL_TICKET_TTL_MS = 24 * 60 * 60 * 1000;

export type LevelErrorCode =
  | "USER_NOT_FOUND"
  | "LEVEL_LOCKED"
  | "OUT_OF_LIVES"
  | "TICKET_NOT_FOUND"
  | "TICKET_USED"
  | "TICKET_EXPIRED"
  | "IMPLAUSIBLE_RUN"
  | "BOOSTER_NOT_ALLOWED"
  | "BOOSTER_NOT_OWNED"
  | "BOOSTER_NOT_NEEDED";

/** A refused level write. The route maps `code` to an HTTP status. */
export class LevelError extends Error {
  constructor(
    public readonly code: LevelErrorCode,
    message: string,
    /** Safe to return to the client (frontier level, next life time). */
    public readonly details: Record<string, string | number | null> = {}
  ) {
    super(message);
    this.name = "LevelError";
  }
}

const LOCKED_USER_SELECT = {
  lives: true,
  lives_updated_at: true,
  xp: true,
  level_streak: true,
  level_fail_season: true,
  level_fail_level: true,
  level_fail_count: true,
} as const;

type LockedUser = Prisma.UserGetPayload<{ select: typeof LOCKED_USER_SELECT }>;

async function lockUser(tx: TxClient, userId: string): Promise<LockedUser> {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: LOCKED_USER_SELECT,
  });
  if (!user) throw new LevelError("USER_NOT_FOUND", "User not found");
  return user;
}

/** Highest level the player may start in a season: 1 + highest cleared. */
async function frontierLevel(tx: TxClient, userId: string, season: number): Promise<number> {
  const top = await tx.levelProgress.aggregate({
    where: { userId, season },
    _max: { level: true },
  });
  return frontierAfter(top._max.level ?? 0);
}

function lifeOf(user: { lives: number; lives_updated_at: Date | null }): LifeState {
  return { lives: user.lives, updatedAt: user.lives_updated_at };
}

function tallyOf(user: {
  level_fail_season: number | null;
  level_fail_level: number | null;
  level_fail_count: number;
}): FailTally | null {
  const { level_fail_season: season, level_fail_level: level, level_fail_count: count } = user;
  return season !== null && level !== null && count > 0 ? { season, level, count } : null;
}

// ── Boosters and star chests (§6.4) ──────────────────────────────────────────

/** Most chests one run opens, so a large catch-up cannot hold the lock long. */
export const MAX_CHESTS_PER_RUN = 10;

/** Add `n` of one booster to the inventory (upsert, under the user lock). */
async function addBooster(tx: TxClient, userId: string, type: BoosterType, n: number, now: Date): Promise<void> {
  await tx.userBooster.upsert({
    where: { user_booster_type: { userId, type } },
    create: { id: nanoid(), userId, type, count: n, updated_at: now },
    update: { count: { increment: n }, updated_at: now },
  });
}

/** Spend one owned booster; false when none is owned. */
async function spendBooster(tx: TxClient, userId: string, type: BoosterType, now: Date): Promise<boolean> {
  const spent = await tx.userBooster.updateMany({
    where: { userId, type, count: { gt: 0 } },
    data: { count: { decrement: 1 }, updated_at: now },
  });
  return spent.count === 1;
}

async function inventoryOf(tx: TxClient | typeof prisma, userId: string): Promise<BoosterInventory> {
  const rows = await tx.userBooster.findMany({ where: { userId }, select: { type: true, count: true } });
  return boosterInventory(rows);
}

/** Lifetime stars: the sum of best stars on every level of every season. */
async function lifetimeStarsOf(tx: TxClient | typeof prisma, userId: string): Promise<number> {
  const sum = await tx.levelProgress.aggregate({ where: { userId }, _sum: { stars: true } });
  return sum._sum.stars ?? 0;
}

export interface OpenedChest {
  chestNumber: number;
  boosters: BoosterType[];
}

/**
 * Open every chest the lifetime star total has earned and not yet opened
 * (catch-up, at most MAX_CHESTS_PER_RUN), and add their boosters to the
 * inventory. Each chest row is unique on (user, number) and inserted with
 * ON CONFLICT DO NOTHING, and only an inserted row pays. Opens nothing with
 * no secret (production without STAR_CHEST_SECRET) or an empty pool: the
 * chests stay earned and open on a later clear.
 */
async function openEarnedChests(
  tx: TxClient,
  userId: string,
  secret: string | null,
  pool: readonly BoosterType[],
  now: Date
): Promise<{ opened: OpenedChest[]; lifetimeStars: number }> {
  const lifetimeStars = await lifetimeStarsOf(tx, userId);
  const earned = chestsEarned(lifetimeStars);
  if (secret === null || pool.length === 0 || earned === 0) return { opened: [], lifetimeStars };
  const last = await tx.starChest.aggregate({ where: { userId }, _max: { chest_number: true } });
  const from = (last._max.chest_number ?? 0) + 1;
  const opened: OpenedChest[] = [];
  for (let n = from; n <= earned && n < from + MAX_CHESTS_PER_RUN; n++) {
    const boosters = rollStarChest(secret, userId, n, pool);
    if (boosters.length === 0) break;
    const inserted = await tx.starChest.createMany({
      data: [{ id: nanoid(), userId, chest_number: n, boosters, created_at: now }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) continue;
    for (const type of boosters) await addBooster(tx, userId, type, 1, now);
    opened.push({ chestNumber: n, boosters });
  }
  return { opened, lifetimeStars };
}

function tallyColumns(tally: FailTally | null) {
  return {
    level_fail_season: tally?.season ?? null,
    level_fail_level: tally?.level ?? null,
    level_fail_count: tally?.count ?? 0,
  };
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export interface IssueTicketInput {
  userId: string;
  season: number;
  level: number;
  /** Server's LEVEL_SIM_VERSION (the route has already matched the client's). */
  simVersion: number;
  /** Booster types the level allows, from the server's season manifest. */
  allowedBoosters: readonly BoosterType[];
  /** An owned booster to equip (already allow-list parsed), or null/absent. */
  booster?: BoosterType | null;
  now: Date;
}

export interface IssuedTicket {
  ticketId: string;
  expiresAt: Date;
  lifeSpent: boolean;
  lives: number;
  nextLifeAt: Date | null;
  /** What the run starts with at GO, decided here and stored on the ticket. */
  startPowerUp: StartPowerUp | null;
  /** Win streak after any open ticket was closed (design §6.3). */
  streak: number;
  /** Fails recorded at this level (0 unless it is the frontier), §5c. */
  failsAtLevel: number;
  /** Stuck help: the bot's route ghost may be shown on this run. */
  routeGhostAvailable: boolean;
  /** Booster inventory after this ticket (one less of an equipped booster). */
  boosters: BoosterInventory;
}

/**
 * Start a level: check it is unlocked, close any open ticket, spend a life
 * unless the level is free, and issue a ticket. All under the user's row lock.
 *
 * Contract for the app: a finished or crashed run should be submitted to
 * /result before a new level is started, since starting one closes the open
 * ticket. The only closed ticket that gets its life back is a restart within
 * the bad-start window (server clock, isQuickRestart).
 *
 * A requested booster must be allowed on the level, owned, and not replace a
 * free power-up (streak or stuck help), or the whole start is refused and
 * nothing is written. It is spent here and refunded only on a bad start.
 *
 * @throws LevelError LEVEL_LOCKED | OUT_OF_LIVES | USER_NOT_FOUND
 *                    | BOOSTER_NOT_ALLOWED | BOOSTER_NOT_OWNED | BOOSTER_NOT_NEEDED
 */
export async function issueLevelTicket(input: IssueTicketInput): Promise<IssuedTicket> {
  const { userId, season, level, now } = input;
  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);

    const frontier = await frontierLevel(tx, userId, season);
    if (level > frontier) {
      throw new LevelError("LEVEL_LOCKED", "Clear the earlier levels first", { frontier });
    }

    let life = refillLives(lifeOf(user), now);
    let streak = user.level_streak;
    let tally = tallyOf(user);
    // Frontier per season, for the open tickets closed below (a ticket may be
    // from another season). The user lock keeps these stable.
    const frontiers = new Map<number, number>([[season, frontier]]);
    const frontierOf = async (s: number): Promise<number> => {
      const known = frontiers.get(s);
      if (known !== undefined) return known;
      const f = await frontierLevel(tx, userId, s);
      frontiers.set(s, f);
      return f;
    };

    // One open ticket per user. Starting a new level while one is open counts
    // as a loss (design §6.3) and keeps its life spent, except a restart
    // within 3 s of GO (§5b), which is a bad start and refunded. Each close is
    // conditional on used_at IS NULL, so a refund follows only a real close.
    const open = await tx.levelRunTicket.findMany({
      where: { userId, used_at: null },
      select: { id: true, season: true, level: true, created_at: true, life_spent: true, booster: true },
      orderBy: { created_at: "asc" },
    });
    for (const ticket of open) {
      const outcome: TicketOutcome = isQuickRestart(ticket.created_at, now) ? "bad_start" : "abandoned";
      const closed = await tx.levelRunTicket.updateMany({
        where: { id: ticket.id, used_at: null },
        data: { used_at: now, outcome },
      });
      if (closed.count !== 1) continue;
      if (outcome === "bad_start" && ticket.life_spent) life = refundLife(life, now);
      const spentBooster = parseBoosterType(ticket.booster);
      if (outcome === "bad_start" && spentBooster !== null) await addBooster(tx, userId, spentBooster, 1, now);
      // An abandoned run at the frontier is a loss (§6.3).
      const atFrontier = ticket.level === (await frontierOf(ticket.season));
      streak = nextStreak(streak, outcome, atFrontier);
      tally = nextFailTally(tally, ticket, outcome, atFrontier);
    }

    const atFrontier = level === frontier;
    const fails = atFrontier ? failsAt(tally, season, level) : 0;
    const free = freeStartPowerUp({ atFrontier, streak, fails, allowed: input.allowedBoosters });
    const booster = input.booster ?? null;
    if (booster !== null) {
      if (!input.allowedBoosters.includes(booster)) {
        throw new LevelError("BOOSTER_NOT_ALLOWED", "That booster is not unlocked on this level");
      }
      if (free !== null) {
        throw new LevelError("BOOSTER_NOT_NEEDED", "This run already starts with a free power-up", {
          startPowerUp: free.type,
        });
      }
      if (!(await spendBooster(tx, userId, booster, now))) {
        throw new LevelError("BOOSTER_NOT_OWNED", "You have none of that booster left");
      }
    }
    const startPowerUp: StartPowerUp | null = booster !== null ? { type: booster, source: "booster" } : free;

    const lifeSpent = levelCostsLife(level);
    if (lifeSpent) {
      const spent = spendLife(life, now);
      if (!spent) {
        const next = nextLifeAt(life, now);
        throw new LevelError("OUT_OF_LIVES", "No lives left", {
          nextLifeAt: next ? next.toISOString() : null,
        });
      }
      life = spent;
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        lives: life.lives,
        lives_updated_at: life.updatedAt,
        level_streak: streak,
        ...tallyColumns(tally),
      },
    });

    const expiresAt = new Date(now.getTime() + LEVEL_TICKET_TTL_MS);
    const ticket = await tx.levelRunTicket.create({
      data: {
        id: nanoid(),
        userId,
        season,
        level,
        sim_version: input.simVersion,
        start_power_up: startPowerUp?.type ?? null,
        booster,
        life_spent: lifeSpent,
        created_at: now,
        expires_at: expiresAt,
      },
      select: { id: true },
    });

    return {
      ticketId: ticket.id,
      expiresAt,
      lifeSpent,
      lives: life.lives,
      nextLifeAt: nextLifeAt(life, now),
      startPowerUp,
      streak,
      failsAtLevel: fails,
      routeGhostAvailable: routeGhostAvailable(fails),
      boosters: await inventoryOf(tx, userId),
    };
  });
}

/**
 * The season and level of `userId`'s open ticket `ticketId`, for the result
 * route's rate-limit key. Read without a lock: submitLevelResult re-checks
 * the ticket under the lock before anything is written. Another user's
 * ticket reads as not found.
 *
 * @throws LevelError TICKET_NOT_FOUND | TICKET_USED | TICKET_EXPIRED
 */
export async function openTicketLevel(
  userId: string,
  ticketId: string,
  now: Date
): Promise<{ season: number; level: number }> {
  const ticket = await prisma.levelRunTicket.findFirst({ where: { id: ticketId, userId } });
  assertOpen(ticket, now);
  return { season: ticket.season, level: ticket.level };
}

type TicketRow = NonNullable<Awaited<ReturnType<typeof prisma.levelRunTicket.findFirst>>>;

function assertOpen(ticket: TicketRow | null, now: Date): asserts ticket is TicketRow {
  if (!ticket) throw new LevelError("TICKET_NOT_FOUND", "Run ticket not found");
  if (ticket.used_at !== null) throw new LevelError("TICKET_USED", "This run was already submitted");
  if (ticket.expires_at.getTime() <= now.getTime()) {
    throw new LevelError("TICKET_EXPIRED", "This run ticket has expired");
  }
}

// ── Results ──────────────────────────────────────────────────────────────────

export type LevelOutcome = "cleared" | "failed" | "bad_start";

export interface SubmitResultInput {
  userId: string;
  ticketId: string;
  /** The device's report of the run, already parsed by parseReportedRun. */
  run: ReportedRun;
  /** Stored with the best run (friend ghosts) when it is the fastest. Unverified. */
  replayToken: string | null;
  /** Star chest HMAC key (starChestSecret()); null opens no chests. */
  chestSecret?: string | null;
  now: Date;
}

export interface LevelResult {
  season: number;
  level: number;
  outcome: LevelOutcome;
  /** Stars this run earned (0 when not cleared). */
  stars: number;
  /** Best stars on the level after this run. */
  bestStars: number;
  /** Stars on the level before this run. */
  previousStars: number;
  /** Fastest verified finish after this run, or null if never cleared. */
  bestTicks: number | null;
  /** True when this run set the level's best time (first clear included). */
  newBest: boolean;
  lifeRefunded: boolean;
  lives: number;
  nextLifeAt: Date | null;
  xpGained: number;
  xp: number;
  playerLevel: number;
  /** XP keys paid by this run, e.g. "first_clear:1:12". */
  awards: { key: string; amount: number }[];
  /** The ticket's level was the player's frontier when the run was reported. */
  atFrontier: boolean;
  /** Win streak after this run (design §6.3). */
  streak: number;
  /** Fails recorded at this level after this run (0 once cleared), §5c. */
  failsAtLevel: number;
  /** Stuck help: the next try may show the bot's route ghost. */
  routeGhostAvailable: boolean;
  /** Star chests this run opened (§6.4), in order. */
  chestsOpened: OpenedChest[];
  /** Lifetime stars across every season after this run. */
  lifetimeStars: number;
  /** Booster inventory after this run. */
  boosters: BoosterInventory;
}

/**
 * Record a reported level run: check it fits the time since its ticket,
 * consume the ticket once, refund the life on a clear or a bad start, raise
 * stars and best time, and pay the XP it earned for the first time. One
 * transaction under the user lock.
 *
 * @throws LevelError TICKET_NOT_FOUND | TICKET_USED | TICKET_EXPIRED
 *                    | IMPLAUSIBLE_RUN | USER_NOT_FOUND
 */
export async function submitLevelResult(input: SubmitResultInput): Promise<LevelResult> {
  const { userId, ticketId, run, now } = input;
  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    const ticket = await tx.levelRunTicket.findFirst({ where: { id: ticketId, userId } });
    assertOpen(ticket, now);
    const { season, level } = ticket;

    // A run cannot have taken longer than the time since its ticket.
    // Refused without consuming, so an honest client with a skewed report
    // can still resubmit.
    if (!runFitsWallClock(run.ticks, ticket.created_at, now)) {
      throw new LevelError("IMPLAUSIBLE_RUN", "That run is longer than the time since the level started");
    }

    // Whether this run was at the frontier, read before its clear moves it.
    const atFrontier = level === (await frontierLevel(tx, userId, season));

    const stars = run.cleared ? run.stars : 0;
    const finishTicks = run.cleared ? run.ticks : null;
    const outcome: LevelOutcome =
      finishTicks !== null ? "cleared" : isBadStart(run.ticks, ticket.created_at, now) ? "bad_start" : "failed";

    // Consume exactly once. The user lock already serializes submits, and
    // the used_at guard makes the refund conditional on this update itself.
    const consumed = await tx.levelRunTicket.updateMany({
      where: { id: ticketId, userId, used_at: null },
      data: { used_at: now, outcome },
    });
    if (consumed.count !== 1) throw new LevelError("TICKET_USED", "This run was already submitted");

    let life = refillLives(lifeOf(user), now);
    const lifeRefunded = ticket.life_spent && outcome !== "failed";
    if (lifeRefunded) life = refundLife(life, now);
    // An equipped booster comes back only when the run was a bad start.
    const spentBooster = parseBoosterType(ticket.booster);
    if (outcome === "bad_start" && spentBooster !== null) await addBooster(tx, userId, spentBooster, 1, now);

    const previous = await tx.levelProgress.findUnique({
      where: { level_progress_user_level: { userId, season, level } },
      select: { stars: true, best_ticks: true },
    });
    const previousStars = previous?.stars ?? 0;
    let bestStars = previousStars;
    let bestTicks = previous?.best_ticks ?? null;
    let newBest = false;
    const awards: { key: string; amount: number }[] = [];
    let xpGained = 0;

    if (finishTicks !== null) {
      bestStars = Math.max(previousStars, stars);
      newBest = bestTicks === null || finishTicks < bestTicks;
      const best = newBest
        ? {
            best_ticks: finishTicks,
            sim_version: ticket.sim_version,
            start_power_up: ticket.start_power_up,
            replay_token: input.replayToken,
            updated_at: now,
          }
        : {};
      if (newBest) bestTicks = finishTicks;
      if (previous) {
        await tx.levelProgress.update({
          where: { level_progress_user_level: { userId, season, level } },
          data: { stars: bestStars, ...best },
        });
      } else {
        await tx.levelProgress.create({
          data: {
            id: nanoid(),
            userId,
            season,
            level,
            stars: bestStars,
            best_ticks: finishTicks,
            sim_version: ticket.sim_version,
            start_power_up: ticket.start_power_up,
            replay_token: input.replayToken,
            created_at: now,
            updated_at: now,
          },
        });
      }

      const { first, last } = episodeLevels(episodeOf(level));
      const clearedInEpisode = await tx.levelProgress.count({
        where: { userId, season, level: { gte: first, lte: last } },
      });
      const episodeCleared = clearedInEpisode === last - first + 1;

      for (const award of xpAwardsForClear(season, level, bestStars, episodeCleared)) {
        const inserted = await tx.xpGrant.createMany({
          data: [{ id: nanoid(), userId, source: award.source, key: award.key, amount: award.amount, created_at: now }],
          skipDuplicates: true,
        });
        if (inserted.count === 1) {
          xpGained += award.amount;
          awards.push({ key: award.key, amount: award.amount });
        }
      }
    }

    // Chests: every clear catches up on any earned and unopened, drawing
    // from the boosters unlocked at the player's highest cleared level.
    let chests: { opened: OpenedChest[]; lifetimeStars: number };
    if (finishTicks !== null) {
      const highest = (await frontierLevel(tx, userId, season)) - 1;
      const pool = levelBoosterTypes(season, Math.min(LEVELS_PER_SEASON, highest)) ?? [];
      chests = await openEarnedChests(tx, userId, input.chestSecret ?? null, pool, now);
    } else {
      chests = { opened: [], lifetimeStars: await lifetimeStarsOf(tx, userId) };
    }

    const streak = nextStreak(user.level_streak, outcome, atFrontier);
    const tally = nextFailTally(tallyOf(user), { season, level }, outcome, atFrontier);
    const failsAtLevel = atFrontier ? failsAt(tally, season, level) : 0;

    const xp = user.xp + xpGained;
    const playerLevel = playerLevelForXp(xp);
    await tx.user.update({
      where: { id: userId },
      data: {
        lives: life.lives,
        lives_updated_at: life.updatedAt,
        xp,
        player_level: playerLevel,
        level_streak: streak,
        ...tallyColumns(tally),
      },
    });

    return {
      season,
      level,
      outcome,
      stars,
      bestStars,
      previousStars,
      bestTicks,
      newBest,
      lifeRefunded,
      lives: life.lives,
      nextLifeAt: nextLifeAt(life, now),
      xpGained,
      xp,
      playerLevel,
      awards,
      atFrontier,
      streak,
      failsAtLevel,
      routeGhostAvailable: routeGhostAvailable(failsAtLevel),
      chestsOpened: chests.opened,
      lifetimeStars: chests.lifetimeStars,
      boosters: await inventoryOf(tx, userId),
    };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface LevelProfile {
  lives: number;
  maxLives: number;
  nextLifeAt: Date | null;
  xp: number;
  playerLevel: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  season: number;
  /** Highest level the player may start in this season. */
  frontier: number;
  totalStars: number;
  levels: { level: number; stars: number; bestTicks: number }[];
  /** Win streak: first clears in a row at the frontier (design §6.3). */
  streak: number;
  /**
   * What a run of the frontier level would start with if started now, from
   * the streak (a preview for the start sheet; the ticket decides for real).
   */
  nextStartPowerUp: StartPowerUp | null;
  /**
   * Stuck help at the frontier level (§5c): fails there, and whether the
   * route ghost is offered. The ghost view itself is not built yet.
   */
  stuck: { level: number; fails: number; routeGhostAvailable: boolean };
  /** Owned boosters (§6.4). */
  boosters: BoosterInventory;
  /** Star chest progress: lifetime stars, stars into the next chest, chests earned. */
  chests: { lifetimeStars: number; starsIntoChest: number; perChest: number; earned: number };
}

/**
 * The player's lives, XP and progress in one season. Read-only: the refill
 * is computed, never written, so a GET creates and changes nothing. A user
 * with no row yet gets the same fresh profile a new row would give (5 lives,
 * no XP, level 1 unlocked), without a row being created.
 */
export async function levelProfile(userId: string, season: number, now: Date): Promise<LevelProfile> {
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lives: true,
      lives_updated_at: true,
      xp: true,
      level_streak: true,
      level_fail_season: true,
      level_fail_level: true,
      level_fail_count: true,
    },
  })) ?? {
    lives: MAX_LIVES,
    lives_updated_at: null,
    xp: 0,
    level_streak: 0,
    level_fail_season: null,
    level_fail_level: null,
    level_fail_count: 0,
  };
  const rows = await prisma.levelProgress.findMany({
    where: { userId, season },
    select: { level: true, stars: true, best_ticks: true },
    orderBy: { level: "asc" },
  });
  const life = refillLives(lifeOf(user), now);
  const progress = playerLevelProgress(user.xp);
  const frontier = frontierAfter(rows.reduce((max, r) => Math.max(max, r.level), 0));
  const allowed = levelBoosterTypes(season, frontier) ?? [];
  const fails = failsAt(tallyOf(user), season, frontier);
  const [boosters, lifetimeStars] = await Promise.all([inventoryOf(prisma, userId), lifetimeStarsOf(prisma, userId)]);
  return {
    lives: life.lives,
    maxLives: MAX_LIVES,
    nextLifeAt: nextLifeAt(life, now),
    xp: user.xp,
    playerLevel: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    season,
    frontier,
    totalStars: rows.reduce((sum, r) => sum + r.stars, 0),
    levels: rows.map((r) => ({ level: r.level, stars: r.stars, bestTicks: r.best_ticks })),
    streak: user.level_streak,
    nextStartPowerUp: freeStartPowerUp({ atFrontier: true, streak: user.level_streak, fails, allowed }),
    stuck: { level: frontier, fails, routeGhostAvailable: routeGhostAvailable(fails) },
    boosters,
    chests: { lifetimeStars, ...chestProgress(lifetimeStars) },
  };
}

/**
 * The active season row for `id`, or null when it does not exist or has not
 * started. Inserting a level_seasons row is what switches a season on.
 */
export async function activeLevelSeason(
  id: number,
  now: Date
): Promise<{ id: number; minLevelSimVersion: number } | null> {
  const row = await prisma.levelSeason.findUnique({
    where: { id },
    select: { id: true, starts_at: true, min_level_sim_version: true },
  });
  if (!row || row.starts_at.getTime() > now.getTime()) return null;
  return { id: row.id, minLevelSimVersion: row.min_level_sim_version };
}
