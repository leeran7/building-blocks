/**
 * `levelSpec(season, N)`: one level's settings from its season (design doc §3,
 * §3a, §8). Shared by the season generator, the server verifier and the app.
 * `levelTower` turns a spec into the engine's level tower: layout difficulty
 * and knobs, power-up chance and set, and the goal height.
 *
 * Client-safe: no Node imports.
 */

import { buildFreeTower } from "../freeStack";
import {
  LADDER_JUMP_SPEED_FRAC,
  MAX_GAP_REACH_FRAC,
  MAX_LADDER_HANG_FRAC,
  MAX_LADDER_TOP_GAP_FRAC,
  applyRunSeed,
} from "../towers";
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
export const LEVEL_SPEC_VERSION = 3;

export interface LevelLayout {
  /** Gap width as a fraction of running-jump reach: 34% → 75%. */
  gapFrac: number;
  /** Shortest walk to the next ladder up, ft: 8 → 40. */
  minWalkFt: number;
  /** Share of floors with a single ladder: 50% → 85%. */
  oneLadderFrac: number;
  /** Jump-to-grab gap under hanging ladders, ft (0 before the intro level). */
  hangingLadderFt: number;
  /** Share of ladders that hang: 0 before the intro, 35% there, 70% from L30. */
  hangingLadderShare: number;
  /** Ladder top short of the floor, ft (0 before the intro level). */
  shortTopFt: number;
  /** Share of tall ladders with a short top: 0 before the intro, 50% there, all from L40. */
  shortTopShare: number;
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
  /** Power-up chance per floor (11% → 5%; none on L1-3). */
  powerUpChance: number;
  allowedPowerUps: PowerUpType[];
  /** Type introduced on this level (guaranteed orb + tip), if any. */
  introPowerUp: PowerUpType | null;
  /** Multiplier on power-up effect times (1 → 0.6 by lava dial). */
  powerUpDurationScale: number;
}

/**
 * Power-up chance per floor at lava dial 0 and 1. Halved from the design
 * doc's 22% → 10% (Leeran, 2026-09-28: fewer power-ups per level).
 */
export const POWER_UP_CHANCE_START = 0.11;
export const POWER_UP_CHANCE_END = 0.05;

/**
 * Power-up effect time at lava dial 0 and 1, as a share of each type's base
 * duration: a level-1 rapid climb lasts 10 s, a level-300 one 6 s (Leeran,
 * 2026-09-28: each level sets its own power-up duration).
 */
export const POWER_UP_DURATION_START = 1;
export const POWER_UP_DURATION_END = 0.6;

/** Levels 1-3 teach the climb: no power-ups. */
const NO_POWER_UP_LEVELS = 3;

/** The free tower's physics: every level is climbed on it. */
const FREE_TOWER = buildFreeTower();

/** Rise (ft) of a jump launched at `speed` on the free tower. */
function jumpRiseFt(speed: number): number {
  return (speed * speed) / (2 * FREE_TOWER.gravity);
}

/**
 * Hanging ladders start at 1.6 ft on their intro level (0.8 until Leeran asked
 * for them to hang visibly higher, 2026-09-28) and reach the engine's cap at
 * dL = 1: 70% of a standing jump's rise (1.97 ft; the doc rounds to 2).
 */
const HANGING_LADDER_FT = {
  from: 1.6,
  to: MAX_LADDER_HANG_FRAC * jumpRiseFt(FREE_TOWER.jumpSpeed),
} as const;
/**
 * Short tops start at 0.4 ft and reach the engine's cap at dL = 1: 70% of a
 * ladder jump's rise (0.96 ft; the doc rounds to 1).
 */
const SHORT_TOP_FT = {
  from: 0.4,
  to: MAX_LADDER_TOP_GAP_FRAC * jumpRiseFt(LADDER_JUMP_SPEED_FRAC * FREE_TOWER.jumpSpeed),
} as const;

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

/** Hanging ladders reach their full share on this level. */
export const HANGING_SHARE_PEAK_LEVEL = 30;
/** Share of ladders that hang on the level hanging ladders are introduced. */
const FIRST_HANGING_SHARE = 0.35;
/**
 * Hanging ladders never cover every ladder (Leeran 2026-09-28: was 100% from
 * L30), so floor-standing ladders, the only ones that can stop short, remain.
 */
export const MAX_HANGING_SHARE = 0.7;

/** Hanging-ladder share: 0 before the intro, rising to MAX_HANGING_SHARE. */
function hangingShare(level: number, introLevel: number): number {
  if (level < introLevel) return 0;
  if (level >= HANGING_SHARE_PEAK_LEVEL) return MAX_HANGING_SHARE;
  const t = (level - introLevel) / (HANGING_SHARE_PEAK_LEVEL - introLevel);
  return FIRST_HANGING_SHARE + (MAX_HANGING_SHARE - FIRST_HANGING_SHARE) * t;
}

/**
 * Short tops only go on tall ladders (towers.ladderHasShortTop: floor-standing,
 * across a longer floor gap), so they never cover every ladder (Leeran
 * 2026-09-28: stopping at every ladder read as the climber getting stuck).
 * Half of those on the intro level, all of them from SHORT_TOP_SHARE_PEAK_LEVEL.
 */
const FIRST_SHORT_TOP_SHARE = 0.5;
const SHORT_TOP_SHARE_PEAK_LEVEL = 40;

/** Share of tall ladders with a short top: 0 before the intro, rising to 1. */
function shortTopShare(level: number, introLevel: number): number {
  if (level < introLevel) return 0;
  if (level >= SHORT_TOP_SHARE_PEAK_LEVEL) return 1;
  const t = (level - introLevel) / (SHORT_TOP_SHARE_PEAK_LEVEL - introLevel);
  return FIRST_SHORT_TOP_SHARE + (1 - FIRST_SHORT_TOP_SHARE) * t;
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
  return Math.min(range.to, range.from + (range.to - range.from) * t);
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
      gapFrac: Math.min(MAX_GAP_REACH_FRAC, 0.34 + 0.41 * dL),
      minWalkFt: 8 + 32 * dL,
      oneLadderFrac: 0.5 + 0.35 * dL,
      hangingLadderFt: introKnob(season, level, season.obstacleIntros.hangingLadders, HANGING_LADDER_FT),
      hangingLadderShare: hangingShare(level, season.obstacleIntros.hangingLadders),
      shortTopFt: introKnob(season, level, season.obstacleIntros.shortTops, SHORT_TOP_FT),
      shortTopShare: shortTopShare(level, season.obstacleIntros.shortTops),
    },
    powerUpChance:
      level <= NO_POWER_UP_LEVELS
        ? 0
        : POWER_UP_CHANCE_START - (POWER_UP_CHANCE_START - POWER_UP_CHANCE_END) * d,
    allowedPowerUps: unlocked.map((u) => u.type),
    introPowerUp: intro ? intro.type : null,
    powerUpDurationScale:
      POWER_UP_DURATION_START - (POWER_UP_DURATION_START - POWER_UP_DURATION_END) * d,
  };
}

/**
 * The tower a level is climbed on: the free tower's physics on the level's
 * seed, with the level's layout, power-ups and goal pinned. Lengths are feet,
 * 1:1 with the engine's metres.
 */
export function levelTower(spec: LevelSpec): TowerSpec {
  const tower: TowerSpec = {
    ...applyRunSeed(FREE_TOWER, spec.seed),
    difficulty: spec.layoutDial,
    powerUpChance: spec.powerUpChance,
    goalM: spec.goalFt,
    allowedPowerUps: spec.allowedPowerUps,
    gapReachFrac: spec.layout.gapFrac,
    oneLadderChance: spec.layout.oneLadderFrac,
    minWalkM: spec.layout.minWalkFt,
    ladderHangM: spec.layout.hangingLadderFt,
    hangingLadderShare: spec.layout.hangingLadderShare,
    ladderTopGapM: spec.layout.shortTopFt,
    shortTopShare: spec.layout.shortTopShare,
    powerUpDurationScale: spec.powerUpDurationScale,
  };
  if (spec.introPowerUp !== null) tower.introPowerUp = spec.introPowerUp;
  return tower;
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
  /**
   * The level's clock: finish at or under this many ticks for 1 star, or the
   * run ends as a loss when it runs out. Null on levels with no clock.
   */
  oneStarTicks: number | null;
}

/** Tutorial levels use looser pars so a clean first try earns 3 stars. */
const TUTORIAL_LEVELS = 10;
/**
 * Par multipliers on the route bot's time: [one-star clock, two-star,
 * three-star]. Tightened and the clock added on every level (Leeran
 * 2026-09-28; was ×1.25 / ×1.05 with no clock, ×1.6 / ×1.3 on L1-10).
 */
function parFactors(level: number): readonly [number, number, number] {
  return level <= TUTORIAL_LEVELS ? [2, 1.45, 1.2] : [1.5, 1.15, 1];
}

export function levelPars(level: number, routeTicks: number): LevelPars {
  const [one, two, three] = parFactors(level);
  return {
    twoStarTicks: Math.ceil(routeTicks * two),
    threeStarTicks: Math.ceil(routeTicks * three),
    oneStarTicks: Math.ceil(routeTicks * one),
  };
}
