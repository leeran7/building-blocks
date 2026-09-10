/**
 * GET /api/dashboard
 *
 * The authenticated user's dashboard payload: their free-Climb record and
 * replays, plus 1v1 Duel stats and recent duels.
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
 *
 * Response 200:
 *   { user: { id, email, username },
 *     freeClimb: FreeClimbData | null, replays: ClimbReplayItem[],
 *     duelStats: DuelStats | null, recentDuels: RecentDuelItem[] }
 *
 * Error responses: { error: string, code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { prisma } from "../../../src/db/client";
import { getUserFreeClimbRecord, getUserClimbReplays } from "../../../src/db/climb";
import { getDuelStats, getRecentDuelsForUser } from "../../../src/db/duel";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json(
      { error: "Authentication failed", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const [dbUser, freeClimb, replays, duelStats, recentDuels] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: decoded.uid },
          select: { username: true },
        }),
        getUserFreeClimbRecord(decoded.uid).catch(() => null),
        getUserClimbReplays(decoded.uid).catch(() => []),
        getDuelStats(decoded.uid).catch(() => null),
        getRecentDuelsForUser(decoded.uid).catch(() => []),
      ]);

    console.log(
      JSON.stringify({
        type: "dashboard_request",
        method: "GET",
        path: "/api/dashboard",
        status: 200,
        uid: decoded.uid,
        duration_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      user: {
        id: decoded.uid,
        email: decoded.email ?? "",
        username: dbUser?.username ?? null,
      },
      freeClimb,
      replays,
      duelStats,
      recentDuels,
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
