/**
 * GET /api/climb/daily/leaderboard/friends?day=YYYY-MM-DD
 *
 * Authenticated: the caller and their accepted, leaderboard-consented friends
 * ranked by verified height on one UTC day. The board is always the verified
 * token's user — any user id in the query string is ignored. `day` follows
 * the same rules as the public daily board (optional, strict, last 7 days).
 * Uncached (per user); the mobile client's TTL covers repeat reads.
 *
 * 200: { day, resetsAt, climbers: DailyClimberRank[], hiddenCount, notClimbedCount }
 * 400: { error, code: INVALID_DAY | DAY_OUT_OF_RANGE }
 * 401: { error, code: UNAUTHORIZED }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../../src/lib/rateLimit";
import { friendsDailyLeaderboard } from "../../../../../../src/db/dailyClimb";
import { resolveBoardDay } from "../../../../../../src/lib/dailyBoardDay";
import { nextUtcResetAt } from "../../../../../../src/lib/dailyDay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Every response from this per-user route is private, errors included. */
function noStore(res: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(NO_STORE)) res.headers.set(name, value);
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let uid: string;
  try {
    uid = (await requireAuth(request)).uid;
  } catch (err) {
    if (err instanceof AuthError) return noStore(err.response);
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }

  const now = new Date();
  const resolved = resolveBoardDay(request.nextUrl.searchParams.get("day"), now);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: 400, headers: NO_STORE });
  }

  // Same budget shape as the all-time friends board, in its own namespace.
  const rl = await checkRateLimit({
    namespace: "leaderboard:friends:daily",
    identifier: uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429, headers: NO_STORE });
  }

  try {
    const board = await friendsDailyLeaderboard(uid, resolved.day);
    return NextResponse.json(
      { day: resolved.day, resetsAt: nextUtcResetAt(now).toISOString(), ...board },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("[GET /api/climb/daily/leaderboard/friends]", err);
    return NextResponse.json(
      { error: "Could not load friends' daily leaderboard.", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
