/**
 * Redis-backed fixed-window rate limiting for API route handlers.
 *
 * Two failure modes, chosen per call site:
 *
 * - FAIL CLOSED (auth/security paths): if Redis is unavailable, DENY the request.
 *   Prefer refusing over silently dropping the limit. Used by /api/auth/sync.
 *
 * - FAIL OPEN (revenue / UX paths): if Redis is unavailable, ALLOW the request.
 *   A Redis outage must never block a legitimate purchase or a settings save.
 *   Used by /api/checkout, /api/settings, /api/climb/result.
 *
 * The window is a simple INCR + EXPIRE fixed window: the first request in a
 * window sets the TTL; every request increments the counter; over the max → 429.
 */

import { getRedis } from "./redis";

export interface RateLimitOptions {
  /** Namespace for the key, e.g. "checkout" → key "rl:checkout:<id>". */
  namespace: string;
  /** Stable identifier for the caller (verified UID, or IP for anon). */
  identifier: string;
  /** Max requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * What to do when Redis itself is unavailable.
   * - "open": allow the request (revenue/UX paths — default).
   * - "closed": deny the request (auth/security paths).
   */
  failMode?: "open" | "closed";
}

export interface RateLimitResult {
  /** Whether the request should be allowed through. */
  allowed: boolean;
  /** Current count in the window (undefined when Redis was unavailable). */
  count?: number;
  /** True when the decision came from the fail-open/closed fallback. */
  degraded: boolean;
}

/**
 * Check and consume one unit of the caller's rate-limit budget.
 *
 * Never throws — a Redis error resolves to the configured failMode so callers
 * can treat the result as a plain boolean without a try/catch.
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { namespace, identifier, max, windowSeconds, failMode = "open" } = options;

  try {
    const redis = getRedis();
    const key = `rl:${namespace}:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in the window — set the TTL so the window rolls over.
      await redis.expire(key, windowSeconds);
    }
    return { allowed: count <= max, count, degraded: false };
  } catch (err) {
    console.error(
      `[rateLimit:${namespace}] Redis unavailable, failing ${failMode}:`,
      err
    );
    // fail open → allow, fail closed → deny.
    return { allowed: failMode === "open", degraded: true };
  }
}

/**
 * Best-effort client IP for unauthenticated callers.
 *
 * Trusts the platform-set forwarding headers (Vercel sets x-forwarded-for /
 * x-real-ip). Falls back to a constant bucket so anonymous traffic is still
 * loosely bounded even when no IP is discoverable.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // First entry is the originating client.
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
