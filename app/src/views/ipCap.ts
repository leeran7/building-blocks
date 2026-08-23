/**
 * Per-IP view cap — Redis atomic INCR.
 *
 * Key:  "ip_cap:{ip}:{hour_bucket}"
 * TTL:  70 minutes
 * Cap:  20 qualified views per IP per hour
 *
 * Returns true if the view is within cap, false if cap exceeded.
 */

export const IP_CAP_LIMIT = 20;
export const IP_CAP_TTL_SECONDS = 70 * 60; // 70 minutes

/**
 * Hour bucket — floored to the start of the current hour.
 * Changes every 60 minutes.
 */
export function hourBucket(): number {
  return Math.floor(Date.now() / 3_600_000);
}

/**
 * Redis key for per-IP cap.
 */
export function ipCapKey(ip: string, bucket: number): string {
  return `ip_cap:${ip}:${bucket}`;
}

export interface IpCapResult {
  /** Counter value AFTER increment */
  count: number;
  /** Whether this view is within the cap */
  allowed: boolean;
}

/**
 * Check and increment the per-IP counter.
 * Uses Redis INCR (atomic). Sets TTL on first increment.
 *
 * @param redis - Redis client with incr + expire methods
 * @param ip - client IP address (hashed or raw)
 * @returns IpCapResult
 */
export async function checkIpCap(
  redis: { incr: (key: string) => Promise<number>; expire: (key: string, ttl: number) => Promise<number> },
  ip: string
): Promise<IpCapResult> {
  const bucket = hourBucket();
  const key = ipCapKey(ip, bucket);
  const count = await redis.incr(key);
  // Set TTL only on first increment (count === 1) to avoid resetting it
  if (count === 1) {
    await redis.expire(key, IP_CAP_TTL_SECONDS);
  }
  return {
    count,
    allowed: count <= IP_CAP_LIMIT,
  };
}
