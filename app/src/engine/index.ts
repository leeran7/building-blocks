/**
 * Tower Engine — Pure functions. No I/O, no side effects, no database calls.
 *
 * All economic computation lives here. The server calls these functions;
 * they are NEVER called from client-side code.
 *
 * Critical invariants:
 * - computeGrowth NEVER returns > MAX_GROWTH (8)
 * - computeGrowth NEVER returns NaN or negative
 * - No decay term (exp(-λt)) exists anywhere in this file
 * - Altitude is never decreased by any function here
 */

import { type EngineConstants, loadConstants } from "./constants";

/**
 * Merge partial constants with loaded defaults.
 * Partial overrides are used in tests to inject custom constants.
 */
function mergeConstants(c?: Partial<EngineConstants>): EngineConstants {
  const defaults = loadConstants();
  if (!c) return defaults;
  return { ...defaults, ...c };
}

/**
 * Compute the growth multiplier at the given V (views in thousands).
 *
 * λ = ln(2) / DOUBLE_EVERY_K
 * growth = min(exp(λ · V), MAX_GROWTH)
 *
 * @param V - cumulative qualified views in thousands (>= 0)
 * @param c - optional partial constants override (for testing)
 * @returns growth multiplier in [1, MAX_GROWTH]
 */
export function computeGrowth(V: number, c?: Partial<EngineConstants>): number {
  const { DOUBLE_EVERY_K, MAX_GROWTH } = mergeConstants(c);
  const lambda = Math.log(2) / DOUBLE_EVERY_K;
  const raw = Math.exp(lambda * V);
  // Clamp to [1, MAX_GROWTH] unconditionally — lower bound guards against
  // misconfigured negative DOUBLE_EVERY_K; upper bound is mandatory (AC-7).
  return Math.max(1, Math.min(raw, MAX_GROWTH));
}

/**
 * Compute the current exchange rate (metres per dollar).
 *
 * rate = R0 * growth
 *
 * @param V - cumulative qualified views in thousands
 * @param c - optional partial constants override
 * @returns metres per dollar
 */
export function computeRate(V: number, c?: Partial<EngineConstants>): number {
  const { R0 } = mergeConstants(c);
  return R0 * computeGrowth(V, c);
}

/**
 * Compute the current ground altitude (burial threshold).
 *
 * ground = G0 * growth
 *
 * @param V - cumulative qualified views in thousands
 * @param c - optional partial constants override
 * @returns ground altitude in metres
 */
export function computeGround(V: number, c?: Partial<EngineConstants>): number {
  const { G0 } = mergeConstants(c);
  return G0 * computeGrowth(V, c);
}

/**
 * Compute the altitude metres from a dollar payment at current V.
 *
 * metres = dollars * rate
 *
 * @param dollars - payment amount in USD (>= 0)
 * @param V - current views_k
 * @param c - optional partial constants override
 * @returns altitude metres to add (always >= 0)
 */
export function computeMetres(
  dollars: number,
  V: number,
  c?: Partial<EngineConstants>
): number {
  return dollars * computeRate(V, c);
}

/**
 * Compute the cost (USD) to climb from myAlt to targetAlt at current rate.
 *
 * target_alt = targetAlt * 1.02   (2% buffer to actually beat them)
 * delta      = target_alt - myAlt
 * cost       = max(delta / rate, MIN_SPEND_USD)
 *
 * For a new listing (myAlt = 0), cost to reach rank #1 = targetAlt * 1.02 / rate.
 *
 * @param targetAlt - altitude of the block at the target rank
 * @param myAlt - current altitude of the buyer's block (0 for new listings)
 * @param V - current views_k
 * @param c - optional partial constants override
 * @returns cost in USD (>= MIN_SPEND_USD)
 */
export function priceTo(
  targetAlt: number,
  myAlt: number,
  V: number,
  c?: Partial<EngineConstants>
): number {
  const { MIN_SPEND_USD } = mergeConstants(c);
  const rate = computeRate(V, c);
  const bufferedTarget = targetAlt * 1.02;
  const delta = bufferedTarget - myAlt;
  if (delta <= 0) return MIN_SPEND_USD;
  return Math.max(delta / rate, MIN_SPEND_USD);
}

/**
 * Determine if a block is buried (altitude below ground line).
 *
 * buried = altitude < ground
 *
 * @param altitude - block altitude in metres
 * @param V - current views_k
 * @param c - optional partial constants override
 * @returns true if buried
 */
export function isBuried(
  altitude: number,
  V: number,
  c?: Partial<EngineConstants>
): boolean {
  return altitude < computeGround(V, c);
}

/**
 * Determine if a block is at amber edge (near burial risk).
 *
 * clearance = altitude - ground
 * amber_edge = clearance < 1.6 * ground
 *
 * @param altitude - block altitude in metres
 * @param V - current views_k
 * @param c - optional partial constants override
 * @returns true if in the amber warning zone
 */
export function isAmberEdge(
  altitude: number,
  V: number,
  c?: Partial<EngineConstants>
): boolean {
  const ground = computeGround(V, c);
  // Amber edge only applies to above-ground blocks — buried blocks are already
  // in a worse state and should not also show the amber warning.
  if (altitude < ground) return false;
  const clearance = altitude - ground;
  return clearance < 1.6 * ground;
}

/**
 * Assumed qualified-view accrual per day, in thousands, used to convert a
 * "views until burial" delta into a day estimate.
 */
export const VIEWS_K_PER_DAY_ESTIMATE = 1.0;

/**
 * Estimate days until the rising ground line reaches a block's altitude.
 *
 * Returns 0 when the block is already buried or already at/below G0, and null
 * when the altitude is above the highest ground the season can ever reach
 * (G0 * MAX_GROWTH) — that block will never be buried this season (AC-23).
 *
 * Lives here rather than in the dashboard route because a test that
 * re-implements it locally silently diverges: the previous copy in
 * src/__tests__/v2.test.ts omitted the AC-23 cap and rounded instead of
 * flooring, so two of its assertions asserted the inverse of production.
 *
 * @param altitude - block altitude in metres
 * @param V - current views_k
 * @param c - optional partial constants override
 * @returns whole days until burial, 0 if already buried, null if never
 */
export function estimateDaysUntilBuried(
  altitude: number,
  V: number,
  c?: Partial<EngineConstants>
): number | null {
  if (altitude <= computeGround(V, c)) return 0;

  const { G0, DOUBLE_EVERY_K, MAX_GROWTH } = mergeConstants(c);
  if (altitude <= G0) return 0;

  // AC-23: altitude above maximum possible ground → never buried this season.
  if (altitude > G0 * MAX_GROWTH) return null;

  const lambda = Math.log(2) / DOUBLE_EVERY_K;
  const dV = (1 / lambda) * Math.log(altitude / G0) - V;
  if (dV <= 0) return 0;

  // AC-21: floor (not round) — a conservative estimate never overstates the
  // time a seller has left.
  return Math.floor(dV / VIEWS_K_PER_DAY_ESTIMATE);
}

/**
 * Re-export constants types for convenience.
 */
export type { EngineConstants };
export { loadConstants } from "./constants";
