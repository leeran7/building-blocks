/**
 * Session deduplication — Redis SETNX.
 *
 * Key:  "dedup:{tid}:{30min_bucket}"
 * TTL:  35 minutes (5-minute buffer beyond the 30-minute window)
 *
 * Returns true if this is a new session within the window (first time seen),
 * false if the session was already counted in this 30-minute bucket.
 */

export const DEDUP_TTL_SECONDS = 35 * 60; // 35 minutes

/**
 * 30-minute bucket — floored to the start of the current 30-minute window.
 */
export function thirtyMinBucket(): number {
  return Math.floor(Date.now() / 1_800_000);
}

/**
 * Redis key for session dedup.
 */
export function dedupKey(sessionId: string, bucket: number): string {
  return `dedup:${sessionId}:${bucket}`;
}

/**
 * Check if this session has already been counted in the current 30-min window.
 * Uses Redis SET NX (set if not exists) — atomic.
 *
 * @param redis - Redis client with set method
 * @param sessionId - the tid cookie value (UUID)
 * @returns true if this is a new (uncounted) session, false if duplicate
 */
export async function checkSessionDedup(
  redis: {
    set: (
      key: string,
      value: string,
      options: { nx: true; ex: number }
    ) => Promise<string | null>;
  },
  sessionId: string
): Promise<boolean> {
  const bucket = thirtyMinBucket();
  const key = dedupKey(sessionId, bucket);
  // SETNX with TTL — returns "OK" if set (new), null if already existed
  const result = await redis.set(key, "1", { nx: true, ex: DEDUP_TTL_SECONDS });
  return result !== null; // true = new session (not yet counted)
}
