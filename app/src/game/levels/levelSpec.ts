/**
 * `levelSpec(season, N)`: one level's settings from its season (design doc §3,
 * §3a, §8). Shared by the season generator, the server verifier and the app.
 *
 * Engine status: the level engine (tower difficulty and layout knobs, the goal
 * height finish, allowed power-ups) is being built in its own PRs. Until it
 * lands, `levelTower` is the free tower on the level's seed, the goal is
 * checked by the caller (`levelRun.ts`), and the layout knobs below are
 * computed and recorded but not yet applied to the geometry. When the engine
 * lands, wire the knobs in `levelTower` and regenerate the manifests: the
 * committed manifest's measured route times then stop matching and CI's season
 * check goes red until they are regenerated.
 *
 * Client-safe: no Node imports.
 */

import { buildFreeTower } from "../freeStack";
import { applyRunSeed } from "../towers";
import { DEFAULT_HAZARD_CONFIG, MAX_HAZARD_SPEED_FRAC, hazardMeanSpeedFrac } from "../hazard";
import type { HazardConfig } from "../hazard";
import type { PowerUpType, TowerSpec } from "../types";
import { TICK_HZ } from "../types";
import {
  dialAt,
  isHardLevel,
  isLevelInSeason,
  type SeasonSpec,
} from "./season";

/**
 * Bump when a formula here changes what a level is. Stamped on every manifest
 * so a manifest built from older formulas is refused.
 */
export const LEVEL_SPEC_VERSION = 1;

export interface LevelLayout {
  /** Gap width as a fraction of running-jump reach: 34% → 75%. */
  gapFrac: number;
  /** Shortest walk to the next ladder up, ft: 8 → 40. */
  minWalkFt: number;
  /** Share of floors with a single ladder: 50% → 85%. */
  oneLadderFrac: number;
  /** Jump-to-grab gap under ladders, ft (0 before the intro level). */
  hangingLadderFt: number;
  /** Ladder top short of the floor, ft (0 before the intro level). */
  shortTopFt: number;
}

export interface LevelSpec {
  season: number;
  level: number;
  /** Seed revision: bumped by the generator when a seed fails the gate. */
  rev: number;
  seed: string;
  hard: boolean;
  /** Lava dial `d` in [0, 1]. */
  lavaDial: number;
  /** Layout dial `dL` in [0, 1]. */
  layoutDial: number;
  /** Finish line height, ft. */
  goalFt: number;
  /**
   * How close the lava runs to the route bot's own catch point: the level's
   * lava mean over the lowest lava mean that catches the bot. 0.55 → 0.95.
   */
  tightness: number;
  layout: LevelLayout;
  /** Power-up chance per floor (22% → 10%; none on L1-3). */
  powerUpChance: number;
  allowedPowerUps: PowerUpType[];
  /** Type introduced on this level (guaranteed orb + tip), if any. */
  introPowerUp: PowerUpType | null;
}

/** Levels 1-3 teach the climb: no power-ups. */
const NO_POWER_UP_LEVELS = 3;

/** First-sight hanging ladders start at 0.8 ft and reach 2.0 ft at dL = 1. */
const HANGING_LADDER_FT = { from: 0.8, to: 2.0 } as const;
/** First-sight short tops start at 0.4 ft and reach 1.0 ft at dL = 1. */
const SHORT_TOP_FT = { from: 0.4, to: 1.0 } as const;

export function levelSeed(season: SeasonSpec, level: number, rev: number): string {
  return `${season.seedSalt}:level:${level}:${rev}`;
}

/** Goal height, ft: 24·(3 + 42·d). 72 ft at L1 of season 1, 1,080 ft at L300. */
export function goalFtFor(lavaDial: number): number {
  return 24 * (3 + 42 * lavaDial);
}

/** 0.55 at d = 0 → 0.95 at d = 1 (§3 "lava ratio"). */
export function tightnessFor(lavaDial: number): number {
  return 0.55 + 0.4 * lavaDial;
}

/** Rises linearly in dL from `from` at the intro level to `to` at dL = 1. */
function introKnob(
  season: SeasonSpec,
  level: number,
  introLevel: number,
  range: { from: number; to: number }
): number {
  if (level < introLevel) return 0;
  const d0 = dialAt(season.layout, introLevel);
  const dL = dialAt(season.layout, level);
  const t = d0 >= 1 ? 1 : (dL - d0) / (1 - d0);
  return range.from + (range.to - range.from) * t;
}

export function levelSpec(season: SeasonSpec, level: number, rev = 0): LevelSpec {
  if (!isLevelInSeason(level)) throw new RangeError(`level out of season: ${level}`);
  if (!Number.isInteger(rev) || rev < 0) throw new RangeError(`bad seed revision: ${rev}`);
  const d = dialAt(season.lava, level);
  const dL = dialAt(season.layout, level);
  const unlocked = season.powerUpUnlocks.filter((u) => u.level <= level);
  const intro = season.powerUpUnlocks.find((u) => u.level === level);
  return {
    season: season.id,
    level,
    rev,
    seed: levelSeed(season, level, rev),
    hard: isHardLevel(level),
    lavaDial: d,
    layoutDial: dL,
    goalFt: goalFtFor(d),
    tightness: tightnessFor(d),
    layout: {
      gapFrac: 0.34 + 0.41 * dL,
      minWalkFt: 8 + 32 * dL,
      oneLadderFrac: 0.5 + 0.35 * dL,
      hangingLadderFt: introKnob(season, level, season.obstacleIntros.hangingLadders, HANGING_LADDER_FT),
      shortTopFt: introKnob(season, level, season.obstacleIntros.shortTops, SHORT_TOP_FT),
    },
    powerUpChance: level <= NO_POWER_UP_LEVELS ? 0 : 0.22 - 0.12 * d,
    allowedPowerUps: unlocked.map((u) => u.type),
    introPowerUp: intro ? intro.type : null,
  };
}

/**
 * The tower a level is climbed on. Engine stub: the free tower on the level's
 * seed until the level engine accepts the layout knobs (see header).
 */
export function levelTower(spec: LevelSpec): TowerSpec {
  return applyRunSeed(buildFreeTower(), spec.seed);
}

// ── Lava ────────────────────────────────────────────────────────────────────

/**
 * A level's lava is one number, its time-averaged speed after the ramp as a
 * fraction of ladder speed. Grace, head start and the surge/stumble cycle stay
 * as #157 set them, because the renderer, HUD and music read the default
 * cycle. The start is a fixed share of the end and the ramp is short, so the
 * lava reaches its level speed while the climb is still on.
 */
export interface LevelLava {
  meanFrac: number;
  rampSeconds: number;
}

/** Start speed as a share of the end speed. */
export const LEVEL_LAVA_START_RATIO = 0.75;
/** The ramp takes a quarter of the bot's route time, at most 120 s. */
export const LEVEL_LAVA_RAMP_SHARE = 0.25;
export const LEVEL_LAVA_MAX_RAMP_SECONDS = 120;

/** Mean speed per unit of envelope over one surge/stumble cycle (0.7 today). */
function cycleDuty(): number {
  return hazardMeanSpeedFrac({
    ...DEFAULT_HAZARD_CONFIG,
    startSpeedFrac: 1,
    endSpeedFrac: 1,
    creepPerMinute: 0,
  });
}

/** The fastest mean the lava can run: the envelope at its 1× ladder cap. */
export function maxLavaMeanFrac(): number {
  return cycleDuty() * MAX_HAZARD_SPEED_FRAC;
}

export function levelLavaRampSeconds(routeTicks: number): number {
  return Math.min(
    LEVEL_LAVA_MAX_RAMP_SECONDS,
    (routeTicks / TICK_HZ) * LEVEL_LAVA_RAMP_SHARE
  );
}

export function levelHazard(lava: LevelLava): HazardConfig {
  const end = Math.min(MAX_HAZARD_SPEED_FRAC, lava.meanFrac / cycleDuty());
  return {
    ...DEFAULT_HAZARD_CONFIG,
    startSpeedFrac: end * LEVEL_LAVA_START_RATIO,
    endSpeedFrac: end,
    rampSeconds: lava.rampSeconds,
    creepPerMinute: 0,
  };
}

// ── Stars (§4) ──────────────────────────────────────────────────────────────

export interface LevelPars {
  /** Finish at or under this many ticks for 2 stars. */
  twoStarTicks: number;
  /** Finish at or under this many ticks for 3 stars. */
  threeStarTicks: number;
}

/** Tutorial levels use looser pars so a clean first try earns 3 stars. */
const TUTORIAL_LEVELS = 10;

export function levelPars(level: number, routeTicks: number): LevelPars {
  const tutorial = level <= TUTORIAL_LEVELS;
  return {
    twoStarTicks: Math.ceil(routeTicks * (tutorial ? 1.6 : 1.25)),
    threeStarTicks: Math.ceil(routeTicks * (tutorial ? 1.3 : 1.05)),
  };
}
