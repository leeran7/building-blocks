/**
 * GET /api/climb/leaderboard/friends
 *
 * Authenticated: the caller and their accepted, leaderboard-consented friends
 * ranked by free-stack peak height. The board is always the verified token's
 * user — any user id in the query string or body is ignored.
 *
 * Response 200: { climbers: ClimberRank[], hiddenCount: number, notClimbedCount: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { friendsLeaderboard } from "../../../../../src/db/climb";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "leaderboard:friends",
    identifier: uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const board = await friendsLeaderboard(uid);
    return NextResponse.json(board, { headers: NO_STORE });
  } catch (err) {
    console.error("[GET /api/climb/leaderboard/friends]", err);
    return NextResponse.json(
      { error: "Could not load friends leaderboard.", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
