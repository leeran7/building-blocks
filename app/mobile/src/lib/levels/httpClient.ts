import { TICK_HZ } from "@app/game/types";
import { LEVEL_SIM_VERSION } from "@app/game/simVersion";
import { MAX_LIVES, playerLevelProgress } from "@app/levels/rules";
import { parseAvatarIdList } from "@app/lib/avatars";
import {
  MAX_CHEST_BOOSTERS,
  parseBoosterType,
  type BoosterInventory,
  type BoosterType,
  type StartPowerUp,
  type StartPowerUpSource,
} from "@app/levels/engagement";
import { apiFetch } from "../api";
import { starsForTime } from "./model";
import type {
  ChestProgress,
  LevelBoardEntry,
  LevelBoardView,
  LevelCatalog,
  LevelNode,
  LevelResult,
  LevelRunReport,
  LevelsClient,
  OpenedChest,
  PlayerStats,
  SeasonView,
  StarCount,
  StartOptions,
  StartRefusal,
  StartResult,
  StuckHelp,
} from "./model";

/**
 * The level API on the real server (app/api/levels/*, design §5, §7).
 *
 * The server decides lives, stars, XP and unlocks; this client only reads
 * what it says. Every response is parsed against an allow-list: a body that
 * does not match the route's contract is a failed call, never coerced into
 * plausible numbers. A run is reported as its outcome, stars and ticks;
 * levels have no replay check. The level facts on each pin (seed, goal, pars) come from
 * the app's own copy of the season manifest (`catalog`); the server scores
 * runs against its own copy.
 */

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  catalog: LevelCatalog;
  /** Injected in tests; the app uses the authenticated apiFetch. */
  fetch?: Fetch;
  simVersion?: number;
}

/** A server call that did not return what the contract says. */
export class LevelsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`Level API ${status}${code ? ` ${code}` : ""}`);
    this.name = "LevelsApiError";
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isPositive = (v: unknown): v is number => isCount(v) && v >= 1;
const isStars = (v: unknown): v is StarCount => v === 0 || v === 1 || v === 2 || v === 3;

/** ISO time → epoch ms; null stays null; anything else is invalid (undefined). */
function parseWhen(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

const START_SOURCES: Readonly<Record<StartPowerUpSource, true>> = { streak: true, stuck_help: true, booster: true };

/**
 * A start power-up field: null when absent (an older server) or null, the
 * value when well-formed, undefined (invalid) otherwise.
 */
export function parseStartPowerUp(v: unknown): StartPowerUp | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObject(v)) return undefined;
  const type = parseBoosterType(v.type);
  const source = v.source;
  if (type === null || typeof source !== "string" || !Object.hasOwn(START_SOURCES, source)) return undefined;
  return { type, source: source as StartPowerUpSource };
}

/** An optional count: 0 when absent (an older server), undefined when malformed. */
function optionalCount(v: unknown): number | undefined {
  if (v === undefined) return 0;
  return isCount(v) ? v : undefined;
}

/**
 * A booster inventory ({ type: count }): null when absent (an older server),
 * undefined when malformed. A type this app does not know (a newer server)
 * is left out rather than failing the call: this app cannot equip it, and
 * failing a /result body would hide a run the server already saved.
 */
export function parseBoosterInventory(v: unknown): BoosterInventory | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObject(v)) return undefined;
  const out: BoosterInventory = {};
  for (const [key, count] of Object.entries(v)) {
    if (!isCount(count)) return undefined;
    const type = parseBoosterType(key);
    if (type !== null && count > 0) out[type] = count;
  }
  return out;
}

/** The profile's chest block: null when absent, undefined when malformed. */
export function parseChestProgress(v: unknown): ChestProgress | null | undefined {
  if (v === undefined || v === null) return null;
  if (
    !isObject(v) ||
    !isCount(v.lifetimeStars) ||
    !isCount(v.starsIntoChest) ||
    !isPositive(v.perChest) ||
    v.starsIntoChest >= v.perChest ||
    v.lifetimeStars % v.perChest !== v.starsIntoChest
  ) {
    return undefined;
  }
  return { lifetimeStars: v.lifetimeStars, starsIntoChest: v.starsIntoChest, perChest: v.perChest };
}

/**
 * A result's opened chests: [] when absent, undefined when malformed. As
 * with the inventory, a booster type this app does not know is left out of
 * the reveal (a chest holding only such types is not shown).
 */
export function parseOpenedChests(v: unknown): OpenedChest[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return undefined;
  const out: OpenedChest[] = [];
  for (const c of v) {
    if (!isObject(c) || !isPositive(c.chestNumber) || !Array.isArray(c.boosters)) return undefined;
    if (c.boosters.length === 0 || c.boosters.length > MAX_CHEST_BOOSTERS) return undefined;
    const boosters: BoosterType[] = [];
    for (const b of c.boosters) {
      if (typeof b !== "string") return undefined;
      const type = parseBoosterType(b);
      if (type !== null) boosters.push(type);
    }
    if (boosters.length > 0) out.push({ chestNumber: c.chestNumber, boosters });
  }
  return out;
}

export const ticksToMs = (ticks: number): number => Math.round((ticks / TICK_HZ) * 1000);

/** Player stats from a lifetime XP total plus the lives the server sent. */
function statsFor(xp: number, lives: number, nextLifeAt: number | null, maxLives = MAX_LIVES): PlayerStats {
  const progress = playerLevelProgress(xp);
  return {
    lives,
    maxLives,
    nextLifeAt,
    xp,
    playerLevel: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNext: progress.xpForNextLevel,
  };
}

export interface ProfileRow {
  level: number;
  stars: StarCount;
  bestTicks: number;
}

export interface LevelProfile {
  player: PlayerStats;
  season: number;
  frontier: number;
  levels: ProfileRow[];
  streak: number;
  nextStartPowerUp: StartPowerUp | null;
  stuck: StuckHelp | null;
  boosters: BoosterInventory;
  chests: ChestProgress | null;
}

/** The profile's stuck-help block: null when absent, undefined when malformed. */
function parseStuck(v: unknown): StuckHelp | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObject(v) || !isPositive(v.level) || !isCount(v.fails) || typeof v.routeGhostAvailable !== "boolean") {
    return undefined;
  }
  return { level: v.level, fails: v.fails, routeGhostAvailable: v.routeGhostAvailable };
}

/** GET /api/levels/me body, or null when it breaks the contract. */
export function parseLevelProfile(v: unknown): LevelProfile | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  const streak = optionalCount(v.streak);
  const nextStartPowerUp = parseStartPowerUp(v.nextStartPowerUp);
  const stuck = parseStuck(v.stuck);
  const boosters = parseBoosterInventory(v.boosters);
  const chests = parseChestProgress(v.chests);
  if (
    boosters === undefined ||
    chests === undefined ||
    streak === undefined ||
    nextStartPowerUp === undefined ||
    stuck === undefined ||
    !isCount(v.lives) ||
    !isPositive(v.maxLives) ||
    v.lives > v.maxLives ||
    nextLifeAt === undefined ||
    !isCount(v.xp) ||
    !isPositive(v.playerLevel) ||
    !isCount(v.xpIntoLevel) ||
    !isPositive(v.xpForNextLevel) ||
    !isPositive(v.season) ||
    !isPositive(v.frontier) ||
    !Array.isArray(v.levels)
  ) {
    return null;
  }
  const levels: ProfileRow[] = [];
  for (const row of v.levels) {
    if (!isObject(row) || !isPositive(row.level) || !isStars(row.stars) || !isCount(row.bestTicks)) return null;
    levels.push({ level: row.level, stars: row.stars, bestTicks: row.bestTicks });
  }
  return {
    player: {
      lives: v.lives,
      maxLives: v.maxLives,
      nextLifeAt,
      xp: v.xp,
      playerLevel: v.playerLevel,
      xpIntoLevel: v.xpIntoLevel,
      xpForNext: v.xpForNextLevel,
    },
    season: v.season,
    frontier: v.frontier,
    levels,
    streak,
    nextStartPowerUp,
    stuck,
    boosters: boosters ?? {},
    chests,
  };
}

export interface IssuedTicket {
  ticketId: string;
  season: number;
  level: number;
  lives: number;
  nextLifeAt: number | null;
  startPowerUp: StartPowerUp | null;
}

/** POST /api/levels/ticket 200 body, or null when it breaks the contract. */
export function parseTicket(v: unknown): IssuedTicket | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  const startPowerUp = parseStartPowerUp(v.startPowerUp);
  if (
    startPowerUp === undefined ||
    typeof v.ticketId !== "string" ||
    !/^[A-Za-z0-9_-]{10,64}$/.test(v.ticketId) ||
    !isPositive(v.season) ||
    !isPositive(v.level) ||
    !isCount(v.lives) ||
    nextLifeAt === undefined
  ) {
    return null;
  }
  return { ticketId: v.ticketId, season: v.season, level: v.level, lives: v.lives, nextLifeAt, startPowerUp };
}

export interface ServerResult {
  season: number;
  level: number;
  outcome: "cleared" | "failed" | "bad_start";
  stars: StarCount;
  previousStars: StarCount;
  lives: number;
  nextLifeAt: number | null;
  xpGained: number;
  xp: number;
  /** Null when an older server did not send it. */
  streak: number | null;
  atFrontier: boolean;
  failsAtLevel: number;
  routeGhostAvailable: boolean;
  chestsOpened: OpenedChest[];
  /** Null when an older server did not send it. */
  boosters: BoosterInventory | null;
  /** Avatar ids the run's new stars unlocked (empty on older API builds). */
  unlockedAvatars: string[];
}

/**
 * The result body's `unlockedAvatars`: catalogue ids only. Anything else,
 * absent included, reads as none. The run is already saved, so a bad note
 * costs only the "new character" line, never the result card.
 */
export function parseUnlockedAvatars(v: unknown): string[] {
  return parseAvatarIdList(v) ?? [];
}

/** POST /api/levels/result 200 body, or null when it breaks the contract. */
export function parseServerResult(v: unknown): ServerResult | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  const outcome = v.outcome;
  const streak = v.streak === undefined ? null : isCount(v.streak) ? v.streak : undefined;
  const atFrontier = v.atFrontier === undefined ? false : typeof v.atFrontier === "boolean" ? v.atFrontier : undefined;
  const failsAtLevel = optionalCount(v.failsAtLevel);
  const ghost =
    v.routeGhostAvailable === undefined ? false : typeof v.routeGhostAvailable === "boolean" ? v.routeGhostAvailable : undefined;
  const chestsOpened = parseOpenedChests(v.chestsOpened);
  const boosters = parseBoosterInventory(v.boosters);
  if (
    chestsOpened === undefined ||
    boosters === undefined ||
    // Chests open on a clear only.
    (chestsOpened.length > 0 && outcome !== "cleared") ||
    failsAtLevel === undefined ||
    ghost === undefined ||
    streak === undefined ||
    atFrontier === undefined ||
    !isPositive(v.season) ||
    !isPositive(v.level) ||
    (outcome !== "cleared" && outcome !== "failed" && outcome !== "bad_start") ||
    !isStars(v.stars) ||
    !isStars(v.previousStars) ||
    !isCount(v.lives) ||
    nextLifeAt === undefined ||
    !isCount(v.xpGained) ||
    !isCount(v.xp) ||
    v.xpGained > v.xp ||
    (outcome === "cleared") !== v.stars > 0
  ) {
    return null;
  }
  return {
    season: v.season,
    level: v.level,
    outcome,
    stars: v.stars,
    previousStars: v.previousStars,
    lives: v.lives,
    nextLifeAt,
    xpGained: v.xpGained,
    xp: v.xp,
    unlockedAvatars: parseUnlockedAvatars(v.unlockedAvatars),
    streak,
    atFrontier,
    failsAtLevel,
    routeGhostAvailable: ghost,
    chestsOpened,
    boosters,
  };
}

/** GET /api/levels/board body, or null when it breaks the contract. */
export function parseLevelBoard(v: unknown): LevelBoardView | null {
  if (!isObject(v) || !isPositive(v.level) || !isCount(v.friendCount) || !Array.isArray(v.entries)) return null;
  const entries: LevelBoardEntry[] = [];
  for (const e of v.entries) {
    if (
      !isObject(e) ||
      !isPositive(e.rank) ||
      typeof e.isMe !== "boolean" ||
      typeof e.handle !== "string" ||
      e.handle.length === 0 ||
      e.handle.length > 64 ||
      !isStars(e.stars) ||
      e.stars === 0 ||
      !isPositive(e.bestTicks)
    ) {
      return null;
    }
    entries.push({ rank: e.rank, isMe: e.isMe, handle: e.handle, stars: e.stars, timeMs: ticksToMs(e.bestTicks) });
  }
  return { level: v.level, entries, friendCount: v.friendCount };
}

/** A refused ticket, as the start card words it. */
export function refusalFor(status: number, code: string | null): StartRefusal {
  if (status === 403 && code === "LEVEL_LOCKED") return "LOCKED";
  if (status === 409 && code === "OUT_OF_LIVES") return "OUT_OF_LIVES";
  // The server runs a newer engine, or knows a level this app does not.
  if (status === 409 && code === "SIM_VERSION_MISMATCH") return "UPDATE_REQUIRED";
  if (status === 404 && code === "LEVEL_NOT_FOUND") return "UPDATE_REQUIRED";
  if (status === 400 && code === "INVALID_BOOSTER") return "BOOSTER_UNAVAILABLE";
  if (status === 409 && (code === "BOOSTER_NOT_ALLOWED" || code === "BOOSTER_NOT_OWNED")) return "BOOSTER_UNAVAILABLE";
  return "NETWORK";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const errorCode = (body: unknown): string | null =>
  isObject(body) && typeof body.code === "string" ? body.code : null;

export function createHttpLevelsClient(opts: HttpClientOptions): LevelsClient {
  const { catalog } = opts;
  const call = opts.fetch ?? apiFetch;
  const simVersion = opts.simVersion ?? LEVEL_SIM_VERSION;
  // Lifetime XP from the last profile, for the player stats a ticket shows
  // (the ticket carries lives only).
  let lastXp = 0;

  const post = (path: string, body: object) =>
    call(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const info = (level: number) => {
    if (!Number.isInteger(level) || level < 1 || level > catalog.count) {
      throw new RangeError(`Level ${level} is not in season ${catalog.season}`);
    }
    return catalog.level(level);
  };

  return {
    async getSeason(): Promise<SeasonView> {
      const res = await call(`/api/levels/me?season=${catalog.season}`);
      const body = await readJson(res);
      if (!res.ok) throw new LevelsApiError(res.status, errorCode(body));
      const profile = parseLevelProfile(body);
      if (!profile || profile.season !== catalog.season) throw new LevelsApiError(res.status, "BAD_BODY");
      lastXp = profile.player.xp;

      const best = new Map(profile.levels.map((r) => [r.level, r]));
      const levels: LevelNode[] = [];
      for (let n = 1; n <= catalog.count; n++) {
        const row = best.get(n);
        levels.push({
          ...catalog.level(n),
          stars: row?.stars ?? 0,
          bestMs: row ? ticksToMs(row.bestTicks) : null,
        });
      }
      return {
        season: catalog.season,
        name: catalog.name,
        levels,
        frontier: Math.min(profile.frontier, catalog.count),
        player: profile.player,
        streak: profile.streak,
        nextStartPowerUp: profile.nextStartPowerUp,
        stuck: profile.stuck ?? { level: profile.frontier, fails: 0, routeGhostAvailable: false },
        boosters: profile.boosters,
        chests: profile.chests,
      };
    },

    async startLevel(level: number, opts: StartOptions = {}): Promise<StartResult> {
      const node = info(level);
      const booster = opts.booster ?? null;
      let res: Response;
      try {
        res = await post("/api/levels/ticket", {
          season: catalog.season,
          level,
          simVersion,
          ...(booster ? { booster } : {}),
        });
      } catch {
        return { ok: false, code: "NETWORK" };
      }
      const body = await readJson(res);
      if (!res.ok) {
        const code = refusalFor(res.status, errorCode(body));
        if (code !== "OUT_OF_LIVES") return { ok: false, code };
        const next = isObject(body) ? parseWhen(body.nextLifeAt) : undefined;
        return { ok: false, code, player: statsFor(lastXp, 0, next ?? null) };
      }
      const ticket = parseTicket(body);
      if (!ticket || ticket.season !== catalog.season || ticket.level !== level) {
        return { ok: false, code: "NETWORK" };
      }
      // A power-up this app's copy of the level does not allow means the
      // server knows a newer season: the engine would refuse it at GO.
      if (ticket.startPowerUp && !node.allowedPowerUps.includes(ticket.startPowerUp.type)) {
        return { ok: false, code: "UPDATE_REQUIRED" };
      }
      return {
        ok: true,
        ticket: {
          id: ticket.ticketId,
          level,
          seed: node.seed,
          goalFt: node.goalFt,
          pars: node.pars,
          player: statsFor(lastXp, ticket.lives, ticket.nextLifeAt),
          startPowerUp: ticket.startPowerUp,
        },
      };
    },

    async getBoard(level: number): Promise<LevelBoardView> {
      info(level);
      const res = await call(`/api/levels/board?season=${catalog.season}&level=${level}`);
      const body = await readJson(res);
      if (!res.ok) throw new LevelsApiError(res.status, errorCode(body));
      const board = parseLevelBoard(body);
      if (!board || board.level !== level) throw new LevelsApiError(res.status, "BAD_BODY");
      return board;
    },

    async submitResult(ticketId: string, run: LevelRunReport): Promise<LevelResult> {
      // The device reports the run; levels have no replay check (Leeran,
      // 2026-09-27). Stars come from the level's pars in the app's manifest.
      const played = info(run.level);
      const cleared = run.finished && run.finishedTick !== null;
      const ticks = cleared ? (run.finishedTick as number) : Math.max(0, Math.floor(run.raceTicks));
      const stars: StarCount = cleared ? starsForTime(ticksToMs(ticks), played.pars) : 0;
      const res = await post("/api/levels/result", {
        ticketId,
        cleared,
        stars,
        ticks,
        // Kept by the server for friend ghosts only.
        ...(run.replayToken ? { replayToken: run.replayToken } : {}),
      });
      const body = await readJson(res);
      if (!res.ok) throw new LevelsApiError(res.status, errorCode(body));
      const result = parseServerResult(body);
      if (!result || result.season !== catalog.season || result.level !== run.level) {
        throw new LevelsApiError(res.status, "BAD_BODY");
      }
      const node = played;
      lastXp = result.xp;

      const verdictCleared = result.outcome === "cleared";
      const player = statsFor(result.xp, result.lives, result.nextLifeAt);
      const before = playerLevelProgress(result.xp - result.xpGained).level;
      return {
        level: result.level,
        cleared: verdictCleared,
        stars: result.stars,
        previousStars: result.previousStars,
        timeMs: verdictCleared && run.finishedTick !== null ? ticksToMs(run.finishedTick) : null,
        outOfTime: !verdictCleared && run.outOfTime,
        pars: node.pars,
        goalFt: node.goalFt,
        peakFt: run.peakFt,
        xpGained: result.xpGained,
        newPlayerLevel: player.playerLevel > before ? player.playerLevel : null,
        player,
        unlockedAvatars: result.unlockedAvatars,
        streak: result.streak,
        atFrontier: result.atFrontier,
        failsAtLevel: result.failsAtLevel,
        routeGhostAvailable: result.routeGhostAvailable,
        chestsOpened: result.chestsOpened,
        boosters: result.boosters,
      };
    },
  };
}
