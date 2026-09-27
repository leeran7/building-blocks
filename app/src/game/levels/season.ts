/**
 * Seasons of 300 levels, each generated from one equation (design doc
 * /design/xp-and-levels.md §3 and §3d).
 *
 * A season is data: two difficulty dials, a power-up unlock schedule and the
 * obstacle intro levels. Every level's settings come from its position in the
 * season, with Hard levels (every 5th) counting as three steps instead of one:
 *
 *   e(N)    = N − 1 + 2·floor(N / 5)          e(300) = 418
 *   p(N)    = e(N) / e(300)                   season progress, 0 → 1
 *   dial(N) = start + (end − start) · p(N)^shape
 *
 * `shape < 1` rises fastest early and keeps rising to level 300, so every level
 * is strictly harder than the one before it.
 *
 * Client-safe: no Node imports, so the mobile app and the server share it.
 */

import type { PowerUpType } from "../types";

export const LEVELS_PER_SEASON = 300;

/** Every 5th level is a Hard level: a permanent step up. */
export const HARD_LEVEL_EVERY = 5;

/** One difficulty curve: start → end with a `p^shape` rise. */
export interface DialSpec {
  start: number;
  end: number;
  shape: number;
}

export interface SeasonSpec {
  id: number;
  name: string;
  /** Secret-free prefix for every level seed of the season. */
  seedSalt: string;
  /** Lava dial `d`: lava tightness, goal height, power-up rarity. */
  lava: DialSpec;
  /** Layout dial `dL`: gaps, walks, ladder count, hanging ladders, short tops. */
  layout: DialSpec;
  /** Power-up types in unlock order; a type spawns from its level on. */
  powerUpUnlocks: ReadonlyArray<{ level: number; type: PowerUpType }>;
  /** First-sight level of each new obstacle. */
  obstacleIntros: { hangingLadders: number; shortTops: number };
}

/**
 * The proven ceiling every season ends on (§3d "never ends harder"): lava at
 * the tightest ratio and gaps at 75% of reach. Only the dials' start rises
 * from season to season.
 */
export const DIAL_END = 1;

/** Starts are capped so early levels stay approachable (§3d). */
export const MAX_DIAL_START = { lava: 0.3, layout: 0.4 } as const;

/** Unlock order and levels from §3a (never a Hard level). */
export const DEFAULT_POWER_UP_UNLOCKS: SeasonSpec["powerUpUnlocks"] = [
  { level: 4, type: "rapid-climb" },
  { level: 7, type: "sprint-burst" },
  { level: 11, type: "super-jump" },
  { level: 14, type: "slow-lava" },
  { level: 18, type: "giant" },
  { level: 28, type: "jetpack" },
  { level: 36, type: "harden-lava" },
  { level: 42, type: "random" },
];

export const SEASON_1: SeasonSpec = {
  id: 1,
  name: "Season 1",
  seedSalt: "s1",
  lava: { start: 0, end: DIAL_END, shape: 0.6 },
  layout: { start: 0.1, end: DIAL_END, shape: 0.4 },
  powerUpUnlocks: DEFAULT_POWER_UP_UNLOCKS,
  obstacleIntros: { hangingLadders: 9, shortTops: 21 },
};

/**
 * Every season, oldest first. Past seasons stay playable, so an entry is never
 * removed or edited once its manifest ships; a new season is appended.
 */
export const SEASONS: readonly SeasonSpec[] = [SEASON_1];

export function seasonById(id: number): SeasonSpec | null {
  return SEASONS.find((s) => s.id === id) ?? null;
}

export function isHardLevel(n: number): boolean {
  return n % HARD_LEVEL_EVERY === 0;
}

/** Step count: Hard levels count as three steps. e(1) = 0, e(300) = 418. */
export function stepCount(n: number): number {
  return n - 1 + 2 * Math.floor(n / HARD_LEVEL_EVERY);
}

/** Season progress p(N) in [0, 1]. */
export function seasonProgress(n: number): number {
  return stepCount(n) / stepCount(LEVELS_PER_SEASON);
}

export function dialAt(dial: DialSpec, n: number): number {
  return dial.start + (dial.end - dial.start) * Math.pow(seasonProgress(n), dial.shape);
}

export function isLevelInSeason(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= LEVELS_PER_SEASON;
}

/**
 * Problems that stop a season spec from shipping, empty when it is valid.
 * `prev` is the season before it: a new season must start at least as hard on
 * both dials and strictly harder on one (§3d, Leeran 2026-09-27), and still
 * end on the same proven ceiling.
 */
export function seasonSpecProblems(spec: SeasonSpec, prev: SeasonSpec | null): string[] {
  const out: string[] = [];
  const dials: Array<["lava" | "layout", DialSpec]> = [
    ["lava", spec.lava],
    ["layout", spec.layout],
  ];
  for (const [name, d] of dials) {
    if (d.end !== DIAL_END) out.push(`${name} dial must end at ${DIAL_END}, got ${d.end}`);
    if (!(d.start >= 0 && d.start <= MAX_DIAL_START[name])) {
      out.push(`${name} dial start must be in [0, ${MAX_DIAL_START[name]}], got ${d.start}`);
    }
    if (!(d.shape > 0 && d.shape <= 1)) {
      out.push(`${name} dial shape must be in (0, 1], got ${d.shape}`);
    }
  }
  if (!/^[a-z0-9-]{1,32}$/.test(spec.seedSalt)) {
    out.push(`seedSalt must be 1-32 chars of [a-z0-9-], got "${spec.seedSalt}"`);
  }
  let lastLevel = 0;
  for (const u of spec.powerUpUnlocks) {
    if (!isLevelInSeason(u.level) || u.level <= lastLevel) {
      out.push(`power-up unlocks must be in rising level order (${u.type} at ${u.level})`);
    }
    if (isHardLevel(u.level)) out.push(`${u.type} unlocks on Hard level ${u.level}`);
    lastLevel = u.level;
  }
  for (const [name, n] of Object.entries(spec.obstacleIntros)) {
    if (!isLevelInSeason(n) || isHardLevel(n)) {
      out.push(`${name} intro must be a non-Hard level in the season, got ${n}`);
    }
  }
  if (prev) {
    if (spec.id !== prev.id + 1) out.push(`season id must be ${prev.id + 1}, got ${spec.id}`);
    if (spec.seedSalt === prev.seedSalt) out.push("seedSalt must differ from the previous season");
    const lavaUp = spec.lava.start - prev.lava.start;
    const layoutUp = spec.layout.start - prev.layout.start;
    if (lavaUp < 0 || layoutUp < 0 || (lavaUp === 0 && layoutUp === 0)) {
      out.push("a new season must start harder than the last (dial starts may only rise)");
    }
  }
  return out;
}
