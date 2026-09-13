/**
 * GET /api/climb/leaderboard
 *
 * Public: top 50 free climbers by peak height. Used by the native mobile app.
 * No auth required for reads.
 *
 * Response 200: { climbers: ClimberRank[] }
 */

import { NextResponse } from "next/server";
import { topFreeClimbers } from "../../../../src/db/climb";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const climbers = await topFreeClimbers(50);
    return NextResponse.json({ climbers });
  } catch (err) {
    console.error("[GET /api/climb/leaderboard]", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 500 });
  }
}
