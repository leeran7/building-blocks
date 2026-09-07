/**
 * GET /api/duel/leaderboard — Public 1v1 duel leaderboard.
 *
 * No auth required. Returns the top players ranked by win count.
 * Limit is capped at 50 entries.
 */

import { NextRequest, NextResponse } from "next/server";
import { topDuelStats } from "../../../../src/db/duel";

export const runtime = "nodejs";

const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const limit = Math.min(
    rawLimit && /^\d+$/.test(rawLimit) ? parseInt(rawLimit, 10) : MAX_LIMIT,
    MAX_LIMIT
  );

  const entries = await topDuelStats(limit);

  return NextResponse.json({
    entries: entries.map((entry, i) => ({
      rank: i + 1,
      userId: entry.userId,
      displayName: entry.displayName,
      wins: entry.wins,
      losses: entry.losses,
      winPct: entry.wins + entry.losses > 0
        ? Math.round((entry.wins / (entry.wins + entry.losses)) * 1000) / 10
        : 0,
    })),
  });
}
