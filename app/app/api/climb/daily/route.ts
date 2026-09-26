/**
 * GET /api/climb/daily — which Daily Climb tower is live, by the SERVER clock.
 *
 * Public, no DB. Clients lock their tower to `seed` so the run they submit to
 * POST /api/climb/daily/result is on the tower the server will accept, even
 * when the device clock or timezone is off.
 *
 * Response 200: { day: "YYYY-MM-DD", seed: "daily-YYYY-MM-DD", resetsAt: ISO }
 */

import { NextResponse } from "next/server";
import { dailySeedFor, nextUtcResetAt, utcDayKey } from "../../../../src/lib/dailyDay";

export const runtime = "nodejs";
// Must be evaluated per request: a build-time or CDN-cached body would name
// yesterday's tower after the UTC reset.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const now = new Date();
  const day = utcDayKey(now);
  return NextResponse.json(
    { day, seed: dailySeedFor(day), resetsAt: nextUtcResetAt(now).toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
