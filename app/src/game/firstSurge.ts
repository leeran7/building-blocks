/**
 * Tower v3 "The Climb" — fair first-surge proximity.
 *
 * The rising hazard used to start a fixed 9 m below the base. Lava speed is a
 * fraction of the climber's speed, so that constant offset was not fair: a
 * fast-climb tower (wall-jump chimney) felt the first surge sooner, in floor
 * units, than a slow-climb gauntlet.
 *
 * This module solves, per tower physics (not per seed, not per player), the
 * head-start that makes the first surge miss a fair first-time climber by the
 * same fraction of a floor on every tower.
 *
 * Fair first-time climber, at race-time t:
 *
 *   tFloor = hesitation × (traverseM / moveSpeed + floorGap / climbSpeed)
 *   height(t) = (t / tFloor) × floorGap
 *
 * traverseM is a seed-independent characteristic walk from the solo spawn
 * (centre) toward a typical first ladder, plus a little overshoot — unlucky
 * layouts are a skill tax, not a lava tax. hesitation > 1 is the extra time a
 * new player spends finding the ladder vs a greedy bot.
 *
 * First surge ends when the first stumble begins (grace + surge duty). Solve
 *
 *   headStartM = targetMiss − height(t*) + rise(t*)
 *
 * so that height(t*) − lava(t*) = firstSurgeMissFloors × floorGap.
 * Pure in (tower physics, hazard config) so re-simulation stays bit-stable.
 */

import { TowerSpec } from "./types";
import {
  DEFAULT_HAZARD_CONFIG,
  HazardConfig,
  firstSurgeEndSeconds,
  hazardHeightAt,
  hazardRiseDistance,
} from "./hazard";

/** Fraction of the playable width a first-time climber walks each floor. */
export const FIRST_RUN_TRAVERSE_FRAC = 0.35;
/** Lava always starts at least this far below the base (spawn must be safe). */
export const MIN_HEAD_START_M = 3;
/** Do not start the lava more than this many floor-gaps below the base. */
export const MAX_HEAD_START_FLOORS = 1.5;

/**
 * Hazard config with `headStartM` solved for this tower when fair-first-surge
 * is on. Cheap and pure — safe to call every tick.
 */
export function resolveHazardConfig(
  tower: TowerSpec,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): HazardConfig {
  if (!cfg.fairFirstSurge) return cfg;
  const headStartM = solvedHeadStartM(tower, cfg);
  if (headStartM === cfg.headStartM) return cfg;
  return { ...cfg, headStartM };
}

/**
 * How close the first surge is supposed to miss a fair first-time climber
 * on this tower. The live sim uses `headStartM`; the rest is the audit trail.
 */
export function firstSurgeProximity(
  tower: TowerSpec,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): FirstSurgeProximity {
  const endSeconds = firstSurgeEndSeconds(cfg);
  const fairHeightM = fairFirstClimberHeight(tower, endSeconds, cfg);
  const { headStartM, clamped } = solveHeadStartM(tower, cfg);
  const resolved: HazardConfig = { ...cfg, headStartM };
  const lavaHeightM = hazardHeightAt(
    endSeconds,
    Math.max(0, tower.maxClimbSpeed),
    resolved
  );
  const missM = fairHeightM - lavaHeightM;
  const gap = Math.max(1e-6, tower.floorGap);
  return {
    headStartM,
    endSeconds,
    fairHeightM,
    lavaHeightM,
    missM,
    missFloors: missM / gap,
    clamped,
  };
}

/**
 * Height a fair first-time climber reaches by `seconds` of race-time — walk
 * a characteristic traverse each floor, climb at the tower's ladder speed,
 * then pay the hesitation tax. Continuous (not stepwise per floor) because
 * we only evaluate it at the first-surge boundary.
 */
export function fairFirstClimberHeight(
  tower: TowerSpec,
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG
): number {
  if (!(seconds > 0)) return 0;
  const tFloor = fairFloorSeconds(tower, cfg);
  return (seconds / tFloor) * Math.max(0, tower.floorGap);
}

function solvedHeadStartM(tower: TowerSpec, cfg: HazardConfig): number {
  return solveHeadStartM(tower, cfg).headStartM;
}

function solveHeadStartM(
  tower: TowerSpec,
  cfg: HazardConfig
): { headStartM: number; clamped: boolean } {
  const t = firstSurgeEndSeconds(cfg);
  const yFair = fairFirstClimberHeight(tower, t, cfg);
  const dist = hazardRiseDistance(t, Math.max(0, tower.maxClimbSpeed), cfg);
  const target =
    Math.max(0, cfg.firstSurgeMissFloors) * Math.max(0, tower.floorGap);
  const raw = target - yFair + dist;
  const min = MIN_HEAD_START_M;
  const max = Math.max(min, MAX_HEAD_START_FLOORS * Math.max(0, tower.floorGap));
  const headStartM = clamp(raw, min, max);
  return { headStartM, clamped: raw < min || raw > max };
}

function fairFloorSeconds(tower: TowerSpec, cfg: HazardConfig): number {
  const move = Math.max(1e-6, tower.moveSpeed);
  const climb = Math.max(1e-6, tower.maxClimbSpeed);
  const gap = Math.max(1e-6, tower.floorGap);
  const hesitation = Math.max(1e-6, cfg.firstRunHesitation);
  return hesitation * (fairFirstRunTraverseM(tower) / move + gap / climb);
}

/**
 * Seed-independent walk per floor. Matches the keep-in band ladders use
 * (`min(10, 8% of width)` in towers.ts) so the characteristic traverse is a
 * fraction of the same playable span every user actually walks.
 */
function fairFirstRunTraverseM(tower: TowerSpec): number {
  const margin = Math.min(10, tower.widthM * 0.08);
  const playable = Math.max(0, tower.widthM - 2 * margin);
  return playable * FIRST_RUN_TRAVERSE_FRAC;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface FirstSurgeProximity {
  /** Metres the lava starts below the base after the solve (and clamp). */
  headStartM: number;
  /** Race-time when the first surge ends. */
  endSeconds: number;
  /** Fair first-time climber height at `endSeconds`. */
  fairHeightM: number;
  /** Lava height at `endSeconds` with the solved head-start. */
  lavaHeightM: number;
  /** `fairHeightM − lavaHeightM` — how close the surge is supposed to miss. */
  missM: number;
  /** `missM` in units of `tower.floorGap`. */
  missFloors: number;
  /** True when the raw solve was outside the head-start clamp. */
  clamped: boolean;
}
