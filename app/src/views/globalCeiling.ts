/**
 * Global view ceiling — Redis atomic INCR.
 *
 * Key:  "global_ceil:{hour_bucket}"
 * TTL:  70 minutes
 *
 * Enforces CEIL_PER_HOUR (default 40,000) global qualified views per hour.
 * This is the hard cap — any bypass is NFR-S5 violation.
 *
 * Deliberately not partitioned by category. Session dedup is per-stack because
 * views_k is per-stack; this counter is the site-wide inflation lid. Per-stack
 * keys would multiply the cap by the number of stacks. A per-stack fairness
 * quota under this lid is a product change, not a bug fix.
 */

import { loadConstants } from "../engine/constants";

export const GLOBAL_CEIL_TTL_SECONDS = 70 * 60; // 70 minutes

/**
 * Redis key for global ceiling.
 */
export function globalCeilKey(bucket: number): string {
  return `global_ceil:${bucket}`;
}

export interface GlobalCeilingResult {
  /** Counter value AFTER increment */
  count: number;
  /** Whether this view is within the global ceiling */
  allowed: boolean;
}

/**
 * Check and increment the global ceiling counter.
 * Uses Redis INCR (atomic — NFR-V2). Sets TTL on first increment.
 *
 * @param redis - Redis client with incr + expire methods
 * @param hourBucket - current hour bucket (from ipCap.hourBucket())
 * @returns GlobalCeilingResult
 */
export async function checkGlobalCeiling(
  redis: {
    incr: (key: string) => Promise<number>;
    expire: (key: string, ttl: number) => Promise<number>;
  },
  hourBucket: number
): Promise<GlobalCeilingResult> {
  const constants = loadConstants();
  const key = globalCeilKey(hourBucket);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, GLOBAL_CEIL_TTL_SECONDS);
  }
  return {
    count,
    allowed: count <= constants.CEIL_PER_HOUR,
  };
}
