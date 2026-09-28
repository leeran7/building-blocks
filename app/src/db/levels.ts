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
  failsAt,
  freeStartPowerUp,
  nextFailTally,
  nextStreak,
  routeGhostAvailable,
  type BoosterType,
  type FailTally,
  type StartPowerUp,
  type TicketOutcome,
} from "../levels/engagement";

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
  | "IMPLAUSIBLE_RUN";

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

function tallyColumns(tally: FailTally | null) {
  return {
    level_fail_season: tally?.season ?? null,
    level_fail_level: tally?.level ?? null,
    level_fail_count: tally?.count ?? 0,
  };
}

// ── Closing open tickets ─────────────────────────────────────────────────────
// Shared by issueLevelTicket (which writes the close) and levelProfile (which
// previews it read-only), so the preview cannot drift from what the next
// ticket issue actually does.

const OPEN_TICKET_SELECT = {
  id: true,
  season: true,
  level: true,
  created_at: true,
  life_spent: true,
} as const;

type OpenTicket = Prisma.LevelRunTicketGetPayload<{ select: typeof OPEN_TICKET_SELECT }>;

/** `userId`'s open tickets, oldest first: the ones the next issue closes. */
function openTickets(client: TxClient, userId: string): Promise<OpenTicket[]> {
  return client.levelRunTicket.findMany({
    where: { userId, used_at: null },
    select: OPEN_TICKET_SELECT,
    orderBy: { created_at: "asc" },
  });
}

/**
 * How an open ticket closes when a new one is issued at `now`: a restart
 * within the bad-start window (§5b) or an abandoned run (§6.3).
 */
function openTicketOutcome(ticket: OpenTicket, now: Date): TicketOutcome {
  return isQuickRestart(ticket.created_at, now) ? "bad_start" : "abandoned";
}

/** Frontier per season, memoised: a ticket may be from another season. */
function frontierLookup(
  client: TxClient,
  userId: string,
  season: number,
  frontier: number
): (s: number) => Promise<number> {
  const frontiers = new Map<number, number>([[season, frontier]]);
  return async (s) => {
    const known = frontiers.get(s);
    if (known !== undefined) return known;
    const f = await frontierLevel(client, userId, s);
    frontiers.set(s, f);
    return f;
  };
}

interface EngagementState {
  streak: number;
  tally: FailTally | null;
}

/** The streak and fail tally after `ticket` closes with `outcome` (pure). */
function afterTicketClose(
  state: EngagementState,
  ticket: OpenTicket,
  outcome: TicketOutcome,
  atFrontier: boolean
): EngagementState {
  return {
    streak: nextStreak(state.streak, outcome, atFrontier),
    tally: nextFailTally(state.tally, ticket, outcome, atFrontier),
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
 * @throws LevelError LEVEL_LOCKED | OUT_OF_LIVES | USER_NOT_FOUND
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
    let state: EngagementState = { streak: user.level_streak, tally: tallyOf(user) };
    // The user lock keeps the per-season frontiers stable.
    const frontierOf = frontierLookup(tx, userId, season, frontier);

    // One open ticket per user. Starting a new level while one is open counts
    // as a loss (design §6.3) and keeps its life spent, except a restart
    // within 3 s of GO (§5b), which is a bad start and refunded. Each close is
    // conditional on used_at IS NULL, so a refund follows only a real close.
    for (const ticket of await openTickets(tx, userId)) {
      const outcome = openTicketOutcome(ticket, now);
      const closed = await tx.levelRunTicket.updateMany({
        where: { id: ticket.id, used_at: null },
        data: { used_at: now, outcome },
      });
      if (closed.count !== 1) continue;
      if (outcome === "bad_start" && ticket.life_spent) life = refundLife(life, now);
      // An abandoned run at the frontier is a loss (§6.3).
      const atFrontier = ticket.level === (await frontierOf(ticket.season));
      state = afterTicketClose(state, ticket, outcome, atFrontier);
    }
    const { streak, tally } = state;

    const atFrontier = level === frontier;
    const fails = atFrontier ? failsAt(tally, season, level) : 0;
    const startPowerUp = freeStartPowerUp({ atFrontier, streak, fails, allowed: input.allowedBoosters });

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
  /**
   * Win streak as recorded: first clears in a row at the frontier (design
   * §6.3). An open ticket is not folded in, since submitting it may still
   * extend the streak.
   */
  streak: number;
  /**
   * What a run of the frontier level would start with if started now (a
   * preview for the start sheet; the ticket decides for real). Like the
   * ticket, it first closes any open ticket, so an abandoned frontier run
   * shows no streak power-up.
   */
  nextStartPowerUp: StartPowerUp | null;
  /**
   * Stuck help at the frontier level (§5c) for a run started now: fails
   * there (open tickets closed as above), and whether the route ghost is
   * offered. The ghost view itself is not built yet.
   */
  stuck: { level: number; fails: number; routeGhostAvailable: boolean };
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
  // Preview the next run as issueLevelTicket will start it: any open ticket is
  // closed first (an abandoned frontier run resets the streak and counts as a
  // fail). Read-only: the closes are folded in memory, never written.
  const frontierOf = frontierLookup(prisma, userId, season, frontier);
  let next: EngagementState = { streak: user.level_streak, tally: tallyOf(user) };
  for (const ticket of await openTickets(prisma, userId)) {
    const atFrontier = ticket.level === (await frontierOf(ticket.season));
    next = afterTicketClose(next, ticket, openTicketOutcome(ticket, now), atFrontier);
  }
  const fails = failsAt(next.tally, season, frontier);
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
    nextStartPowerUp: freeStartPowerUp({ atFrontier: true, streak: next.streak, fails, allowed }),
    stuck: { level: frontier, fails, routeGhostAvailable: routeGhostAvailable(fails) },
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
