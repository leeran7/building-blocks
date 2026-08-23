/**
 * Redis client singleton — edge-compatible via @upstash/redis.
 *
 * Uses @upstash/redis (HTTP-based) for edge middleware compatibility.
 * Falls back to a no-op mock when REDIS_URL is not configured (test env).
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!restUrl || !restToken) {
    throw new Error(
      "Redis not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
    );
  }

  _redis = new Redis({
    url: restUrl,
    token: restToken,
  });

  return _redis;
}

/** Reset singleton — used in tests */
export function resetRedisClient(): void {
  _redis = null;
}
