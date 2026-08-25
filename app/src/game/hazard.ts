/**
 * Tower v3 "The Climb" — Rising Hazard.
 *
 * The rising hazard (lava / flood / collapsing floor) that chases climbers
 * upward is the game-side reuse of the LEADERBOARD ENGINE. The v1/v2 "ground
 * that rises and buries blocks" IS the hazard here — same accelerate-then-cap
 * curve, driven by race-time instead of views.
 *
 * Elegance / spec (spec-next.md, Core Game Design → "Rising hazard reuses the
 * engine", AC-5, AC-6):
 *   - The engine computes ground = G0 * min(exp(λ·V), MAX_GROWTH) via
 *     computeGround(V), with λ = ln(2) / DOUBLE_EVERY_K.
 *   - We feed a race-clock-derived V into the SAME function, UNCHANGED:
 *         V(t) = HAZARD_VIEWS_PER_SEC * t   (t = seconds since match start)
 *     then scale computeGround(V(t)) to the tower's height.
 *   - Consequence, inherited for free: the hazard starts slow, accelerates
 *     mid-race (doubling its effective pace every DOUBLE_EVERY_K "views", now
 *     seconds), and hard-caps at MAX_GROWTH = 8× so it can NEVER rise instantly
 *     — every match resolves.
 *
 * computeGround / computeGrowth are imported and called with NO modification.
 * Only the caller mapping race-time → V is new. That is the whole trick.
 */

import { computeGround } from "../engine/index";
import { type EngineConstants } from "../engine/constants";

/** Tuning for how the shared engine curve maps onto a race. */
export interface HazardConfig {
  /**
   * How many "views (thousands)" of engine-V accrue per second of race time.
   * This is the ONLY new knob — it sets how quickly the hazard walks up the
   * engine's growth curve. Higher = a more aggressive chase.
   */
  HAZARD_VIEWS_PER_SEC: number;
  /**
   * Total climbable height of the tower, in metres. computeGround returns a
   * ground altitude in the same "metres" units as block altitude; we express
   * hazard height in tower metres and never let it exceed towerHeightM (the
   * summit is the finish, not swallowed by lava).
   */
  towerHeightM: number;
}

export const DEFAULT_HAZARD_CONFIG: HazardConfig = {
  // Tuned so a ~90s tower spends most of the race below the cap: at 3 "views"/s,
  // V reaches the MAX_GROWTH cap threshold (~1500 for DOUBLE_EVERY_K=500) only
  // after ~500s, so a normal race lives on the accelerating part of the curve.
  HAZARD_VIEWS_PER_SEC: 3,
  towerHeightM: 300,
};

/**
 * Map race-time (seconds) to the engine's V input. This is the entire new
 * surface area of the reuse: race-time → views.
 */
export function raceTimeToV(seconds: number, cfg: HazardConfig): number {
  const t = Math.max(0, seconds);
  return cfg.HAZARD_VIEWS_PER_SEC * t;
}

/**
 * Rising-hazard height (metres) at the given race-time.
 *
 * hazardHeight(t) = min( computeGround(V(t)) scaled to tower, towerHeightM )
 *
 * Uses the shipped engine `computeGround` UNCHANGED (AC-5). Because
 * computeGrowth clamps at MAX_GROWTH, the rise is bounded and never
 * instantaneous (AC-6).
 *
 * @param seconds race-time since match start (>= 0)
 * @param cfg     hazard tuning (views/sec + tower height)
 * @param c       optional engine constants override (for tests)
 */
export function hazardHeightAt(
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG,
  c?: Partial<EngineConstants>
): number {
  const V = raceTimeToV(seconds, cfg);
  // computeGround at V=0 is G0 (small, > 0). We normalise against the ground's
  // own capped maximum so the tower's full height is the meaningful play space:
  // at the engine cap the hazard is at the tower ceiling.
  const groundNow = computeGround(V, c);
  const groundMax = computeGround(Number.POSITIVE_INFINITY, c); // = G0 * MAX_GROWTH
  const fraction = groundMax > 0 ? groundNow / groundMax : 0;
  const height = fraction * cfg.towerHeightM;
  // Clamp into [0, towerHeightM]; the summit flag is never below the hazard cap.
  return Math.min(Math.max(height, 0), cfg.towerHeightM);
}

/**
 * True if the hazard's top edge has reached or passed a climber's feet-height
 * on this tick — the elimination / respawn condition (spec AC-7).
 *
 * @param feetHeightM climber's feet altitude in tower metres
 * @param seconds     race-time
 */
export function hazardHasReached(
  feetHeightM: number,
  seconds: number,
  cfg: HazardConfig = DEFAULT_HAZARD_CONFIG,
  c?: Partial<EngineConstants>
): boolean {
  return feetHeightM <= hazardHeightAt(seconds, cfg, c);
}
