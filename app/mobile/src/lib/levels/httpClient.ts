import { TICK_HZ } from "@app/game/types";
import { LEVEL_SIM_VERSION } from "@app/game/simVersion";
import { MAX_LIVES, playerLevelProgress } from "@app/levels/rules";
import { apiFetch } from "../api";
import type {
  LevelCatalog,
  LevelNode,
  LevelResult,
  LevelRunReport,
  LevelsClient,
  PlayerStats,
  SeasonView,
  StarCount,
  StartRefusal,
  StartResult,
} from "./model";

/**
 * The level API on the real server (app/api/levels/*, design §5, §7).
 *
 * The server decides lives, stars, XP and unlocks; this client only reads
 * what it says. Every response is parsed against an allow-list: a body that
 * does not match the route's contract is a failed call, never coerced into
 * plausible numbers. A run is reported as its outcome and finish tick; levels
 * have no replay. The level facts on each pin (seed, goal, pars) come from
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
}

/** GET /api/levels/me body, or null when it breaks the contract. */
export function parseLevelProfile(v: unknown): LevelProfile | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  if (
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
  };
}

export interface IssuedTicket {
  ticketId: string;
  season: number;
  level: number;
  lives: number;
  nextLifeAt: number | null;
}

/** POST /api/levels/ticket 200 body, or null when it breaks the contract. */
export function parseTicket(v: unknown): IssuedTicket | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  if (
    typeof v.ticketId !== "string" ||
    !/^[A-Za-z0-9_-]{10,64}$/.test(v.ticketId) ||
    !isPositive(v.season) ||
    !isPositive(v.level) ||
    !isCount(v.lives) ||
    nextLifeAt === undefined
  ) {
    return null;
  }
  return { ticketId: v.ticketId, season: v.season, level: v.level, lives: v.lives, nextLifeAt };
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
}

/** POST /api/levels/result 200 body, or null when it breaks the contract. */
export function parseServerResult(v: unknown): ServerResult | null {
  if (!isObject(v)) return null;
  const nextLifeAt = parseWhen(v.nextLifeAt);
  const outcome = v.outcome;
  if (
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
  };
}

/** A refused ticket, as the start card words it. */
export function refusalFor(status: number, code: string | null): StartRefusal {
  if (status === 403 && code === "LEVEL_LOCKED") return "LOCKED";
  if (status === 409 && code === "OUT_OF_LIVES") return "OUT_OF_LIVES";
  // The server runs a newer engine, or knows a level this app does not.
  if (status === 409 && code === "SIM_VERSION_MISMATCH") return "UPDATE_REQUIRED";
  if (status === 404 && (code === "SEASON_NOT_FOUND" || code === "LEVEL_NOT_FOUND")) return "UPDATE_REQUIRED";
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
      };
    },

    async startLevel(level: number): Promise<StartResult> {
      const node = info(level);
      let res: Response;
      try {
        res = await post("/api/levels/ticket", { season: catalog.season, level, simVersion });
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
      return {
        ok: true,
        ticket: {
          id: ticket.ticketId,
          level,
          seed: node.seed,
          goalFt: node.goalFt,
          pars: node.pars,
          player: statsFor(lastXp, ticket.lives, ticket.nextLifeAt),
        },
      };
    },

    async submitResult(ticketId: string, run: LevelRunReport): Promise<LevelResult> {
      // Levels send the run's outcome directly; there is no replay (Leeran,
      // 2026-09-27). The server scores stars from finishTicks and its pars.
      const cleared = run.finished && run.finishedTick !== null;
      const res = await post("/api/levels/result", {
        ticketId,
        cleared,
        finishTicks: cleared ? run.finishedTick : null,
        peakFt: Math.max(0, Math.round(run.peakFt)),
      });
      const body = await readJson(res);
      if (!res.ok) throw new LevelsApiError(res.status, errorCode(body));
      const result = parseServerResult(body);
      if (!result || result.season !== catalog.season) throw new LevelsApiError(res.status, "BAD_BODY");
      const node = info(result.level);
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
        pars: node.pars,
        goalFt: node.goalFt,
        peakFt: run.peakFt,
        xpGained: result.xpGained,
        newPlayerLevel: player.playerLevel > before ? player.playerLevel : null,
        player,
      };
    },
  };
}
