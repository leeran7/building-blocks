/**
 * Rate limits shared by the climb result routes.
 *
 * POST /api/climb/result and POST /api/climb/daily/result draw from ONE
 * per-IP bucket (same namespace), so a client cannot double its budget by
 * alternating routes. Fails OPEN so a Redis outage never blocks a free run.
 */

import { checkRateLimit, clientIp, type RateLimitResult } from "./rateLimit";

// Climb runs finish frequently, so keep the cap high. Keyed by client IP since
// most play is anonymous.
export const CLIMB_RATE_MAX = 60;
export const CLIMB_RATE_WINDOW_SECONDS = 60;

/**
 * Per-user cap on verified daily submissions. Each one costs a full server
 * re-simulation, and a run takes at least the 3 s countdown plus play, so 20
 * per 5 minutes is far above honest play.
 */
export const DAILY_RESULT_USER_MAX = 20;
export const DAILY_RESULT_USER_WINDOW_SECONDS = 300;

export function checkClimbIpRateLimit(request: Request): Promise<RateLimitResult> {
  return checkRateLimit({
    namespace: "climb",
    identifier: `ip:${clientIp(request)}`,
    max: CLIMB_RATE_MAX,
    windowSeconds: CLIMB_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
}

/**
 * Per-user daily submission limit. The key carries the UTC day: the daily
 * board is partitioned by day, so every key gating writes to it is too.
 */
export function checkDailyResultUserRateLimit(uid: string, day: string): Promise<RateLimitResult> {
  return checkRateLimit({
    namespace: "climb:daily",
    identifier: `${uid}:${day}`,
    max: DAILY_RESULT_USER_MAX,
    windowSeconds: DAILY_RESULT_USER_WINDOW_SECONDS,
    failMode: "open",
  });
}
