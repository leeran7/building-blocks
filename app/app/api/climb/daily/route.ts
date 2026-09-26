/**
 * GET /api/climb/daily — which Daily Climb tower is live, by the SERVER clock.
 *
 * Public, no DB. The only place a daily seed leaves the server, and only for
 * today. The seed is an HMAC of the day (src/lib/dailySeedServer.ts), so a
 * client cannot compute it and must fetch it. Clients lock their tower to
 * `seed` so the run they submit to POST /api/climb/daily/result is on the
 * tower the server will accept, even when the device clock or timezone is off.
 *
 * Response 200: { day: "YYYY-MM-DD", seed: "daily1-<22 base64url chars>", resetsAt: ISO }
 * Response 503: { error, code: "DAILY_UNAVAILABLE" } when DAILY_SEED_SECRET is
 *               missing or too short (fail closed; there is no fallback seed).
 */

import { NextResponse } from "next/server";
import { nextUtcResetAt, utcDayKey } from "../../../../src/lib/dailyDay";
import { dailySeedConfigured, dailySeedFor } from "../../../../src/lib/dailySeedServer";

export const runtime = "nodejs";
// Must be evaluated per request: a build-time or CDN-cached body would name
// yesterday's tower after the UTC reset.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export function GET(): NextResponse {
  if (!dailySeedConfigured()) {
    console.error("[climb/daily] DAILY_SEED_SECRET is missing or too short; the daily is unavailable");
    return NextResponse.json(
      { error: "The daily climb is unavailable right now", code: "DAILY_UNAVAILABLE" },
      { status: 503, headers: NO_STORE }
    );
  }
  const now = new Date();
  const day = utcDayKey(now);
  return NextResponse.json(
    { day, seed: dailySeedFor(day), resetsAt: nextUtcResetAt(now).toISOString() },
    { headers: NO_STORE }
  );
}
