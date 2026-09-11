/**
 * GET /api/duel/stats — Authenticated user's personal duel stats.
 *
 * Returns the signed-in user's win/loss/streak record, or null if they
 * have never played a ranked duel.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../src/lib/api/withAuth";
import { getDuelStats } from "../../../../src/db/duel";

export const runtime = "nodejs";

export const GET = withAuth(async (_request: NextRequest, uid: string) => {
  try {
    const stats = await getDuelStats(uid);
    return NextResponse.json(stats ?? null);
  } catch (err) {
    console.error("[GET /api/duel/stats]", err);
    return NextResponse.json(
      { error: "Could not load your duel stats. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
});
