/**
 * GET /api/dashboard
 *
 * The authenticated user's dashboard payload: their free-Climb record and
 * replays, plus 1v1 Duel stats and recent duels.
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
 *
 * Response 200: the `DashboardData` payload built by buildDashboardPayload —
 *   { user: { id, email, username, betaJoined },
 *     freeClimb: FreeClimbData | null, replays: ClimbReplayItem[],
 *     duelStats: DuelRecordData | null, recentDuels: DuelReplayItem[] }
 *
 * The same builder backs the /dashboard server component, so this response and
 * that page's `initialData` cannot drift.
 *
 * Error responses: { error: string, code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { buildDashboardPayload } from "../../../src/db/dashboard";

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
    const payload = await buildDashboardPayload(decoded.uid, decoded.email ?? "");

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

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { error: "Could not load your dashboard. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
