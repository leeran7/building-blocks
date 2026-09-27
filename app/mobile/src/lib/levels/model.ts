import type { PowerUpType } from "@app/game/types";

/**
 * What the level screens show, and the calls they make. The shapes follow the
 * level design doc (/design/xp-and-levels.md §3–§7): numbered levels in seasons
 * of 300, stars by finish time, lives that refill, XP and a player level.
 *
 * Everything here is display data. Stars, XP, unlocks and lives are decided by
 * the server from a replay (§7); the app never computes them for real.
 */

export const EPISODE_SIZE = 15;
export const MAX_STARS = 3;

export type StarCount = 0 | 1 | 2 | 3;

/** One pin on the map. */
export interface LevelNode {
  level: number;
  /** Fixed, public seed: everyone climbs the same tower for this level. */
  seed: string;
  /** Best stars so far; 0 = not cleared. */
  stars: StarCount;
  /** Best clear time, ms; null until cleared. */
  bestMs: number | null;
  /** Summit height the climb must reach, ft. */
  goalFt: number;
  /** Finish at or under these times for 2 and 3 stars, ms. */
  pars: { twoStarMs: number; threeStarMs: number };
  /** The power-up this level introduces with a one-line tip, if any. */
  introPowerUp: PowerUpType | null;
  /** Obstacle this level introduces (hanging ladders, short tops), if any. */
  introTip: string | null;
  /** Tutorial levels cost no lives (§5b). */
  costsLife: boolean;
}

export interface PlayerStats {
  lives: number;
  maxLives: number;
  /** When the next life arrives, epoch ms; null while lives are full. */
  nextLifeAt: number | null;
  xp: number;
  playerLevel: number;
  /** XP earned inside the current player level, and the step to the next. */
  xpIntoLevel: number;
  xpForNext: number;
}

export interface SeasonView {
  season: number;
  name: string;
  /** Every level of the season, 1-based and in order. */
  levels: LevelNode[];
  /** Highest unlocked level: 1 + highest cleared, capped at the season length. */
  frontier: number;
  player: PlayerStats;
}

/** A level run the server allowed to start (the doc's run ticket). */
export interface LevelTicket {
  id: string;
  level: number;
  /** Fixed seed: everyone climbs the same tower for this level. */
  seed: string;
  goalFt: number;
  pars: LevelNode["pars"];
  player: PlayerStats;
}

export type StartRefusal =
  /** No lives left: wait for nextLifeAt or play Practice. */
  | "OUT_OF_LIVES"
  /** Beyond the frontier. */
  | "LOCKED"
  /** The installed engine is older than the level needs. */
  | "UPDATE_REQUIRED"
  /** The server could not be reached. */
  | "NETWORK";

export type StartResult =
  | { ok: true; ticket: LevelTicket }
  | { ok: false; code: StartRefusal; player?: PlayerStats };

/** What the app sends when a level run ends. */
export interface LevelRunReport {
  level: number;
  /** Reached the summit. */
  finished: boolean;
  /** Tick the summit was reached, from GO; null on a loss. */
  finishedTick: number | null;
  /** Race ticks from GO until the run ended (the finish tick on a clear). */
  raceTicks: number;
  /** Highest point reached, ft. */
  peakFt: number;
  /** Replay token of the run's inputs, kept for friend ghosts; not verified. */
  replayToken: string | null;
}

/** The server's verdict on a level run. */
export interface LevelResult {
  level: number;
  cleared: boolean;
  /** Stars earned by this run (0 on a loss). */
  stars: StarCount;
  /** Best stars before this run, so the screen can show which are new. */
  previousStars: StarCount;
  /** Finish time on a clear; null on a loss. */
  timeMs: number | null;
  pars: LevelNode["pars"];
  goalFt: number;
  peakFt: number;
  xpGained: number;
  /** Set when this run moved the player up a level. */
  newPlayerLevel: number | null;
  player: PlayerStats;
}

/** A level's fixed facts: everything on its pin except the player's progress. */
export type LevelInfo = Omit<LevelNode, "stars" | "bestMs">;

/**
 * One season's fixed levels, from the season manifest the app ships with. The
 * server holds its own copy and scores runs against that, never this one.
 */
export interface LevelCatalog {
  season: number;
  name: string;
  /** Levels in the season, numbered 1..count. */
  count: number;
  level(n: number): LevelInfo;
}

/**
 * The level API as the screens use it: `createHttpLevelsClient` on the level
 * routes, or `createMockLevelsClient` where those routes are not deployed.
 */
export interface LevelsClient {
  getSeason(): Promise<SeasonView>;
  startLevel(level: number): Promise<StartResult>;
  submitResult(ticketId: string, run: LevelRunReport): Promise<LevelResult>;
}

/** Every 5th level is a Hard level (§3). */
export function isHardLevel(level: number): boolean {
  return level % 5 === 0;
}

/** 1-based episode a level belongs to (episodes of 15, §2). */
export function episodeOf(level: number): number {
  return Math.floor((level - 1) / EPISODE_SIZE) + 1;
}

/** Stars a finish time earns against a level's pars (§4): 1 for any clear. */
export function starsForTime(timeMs: number, pars: LevelNode["pars"]): StarCount {
  if (timeMs <= pars.threeStarMs) return 3;
  if (timeMs <= pars.twoStarMs) return 2;
  return 1;
}

/** "0:28" / "1:04" for a duration in ms, rounded up to the second. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** How far short of the summit a lost run ended, ft (never negative). */
export function feetShort(result: Pick<LevelResult, "goalFt" | "peakFt">): number {
  return Math.max(0, Math.ceil(result.goalFt - result.peakFt));
}
