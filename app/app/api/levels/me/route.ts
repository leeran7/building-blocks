/**
 * GET /api/levels/me?season=1 — the signed-in player's lives, XP, player
 * level and progress in one season (mobile Level System, design §5).
 *
 * Read-only: the life refill is computed from lives_updated_at and the server
 * clock, never written, and a player with no users row gets a fresh profile
 * rather than a row created on read (context/trust.md #6).
 *
 * 200:      LevelProfile (src/db/levels.ts) with dates as ISO strings
 * 400:      { error, code: INVALID_SEASON }
 * 401:      { error, code: UNAUTHORIZED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { levelProfile } from "../../../../src/db/levels";
import { MAX_LIVES, playerLevelProgress } from "../../../../src/levels/rules";
import { NO_STORE, levelPlayer, parseSeasonId, reject } from "../../../../src/levels/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("season") ?? "1";
  const season = /^\d{1,5}$/.test(raw) ? parseSeasonId(Number(raw)) : null;
  if (season === null) return reject(400, "INVALID_SEASON", "Unknown season");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  try {
    const profile = await levelProfile(player.uid, season, new Date());
    if (!profile) {
      const fresh = playerLevelProgress(0);
      return NextResponse.json(
        {
          lives: MAX_LIVES,
          maxLives: MAX_LIVES,
          nextLifeAt: null,
          xp: 0,
          playerLevel: fresh.level,
          xpIntoLevel: fresh.xpIntoLevel,
          xpForNextLevel: fresh.xpForNextLevel,
          season,
          frontier: 1,
          totalStars: 0,
          levels: [],
        },
        { status: 200, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { ...profile, nextLifeAt: profile.nextLifeAt?.toISOString() ?? null },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    console.error("[levels/me] read failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not load level progress");
  }
}
