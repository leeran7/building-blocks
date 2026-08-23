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
 * Re-export constants types for convenience.
 */
export type { EngineConstants };
export { loadConstants } from "./constants";
