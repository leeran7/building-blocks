/**
 * GET /api/levels/board?season=1&level=12 — the friends-only board for one
 * level (design §4 "per-level boards are friends-only", §6.1 privacy).
 *
 * The caller's accepted friends' best clears plus their own, fastest first.
 * Pending, declined and blocked friendships (a blocked row in either
 * direction) are left out, in src/db/levelExtras.ts. The board is always the
 * verified token's user: no user id is read from the request. Signed-in,
 * non-anonymous players only, rate limited like the other level routes (the
 * shared climb IP bucket plus a per-user cap).
 *
 * Level times are device-reported (decision 15), which is why this board is
 * friends-only and never global.
 *
 * 200:      LevelBoard (src/db/levelExtras.ts)
 * 400:      { error, code: INVALID_LEVEL }
 * 401:      { error, code: UNAUTHORIZED }
 * 404:      { error, code: SEASON_NOT_FOUND }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { levelFriendsBoard } from "../../../../src/db/levelExtras";
import { catalogLevel } from "../../../../src/levels/catalog";
import { isLevelNumber } from "../../../../src/levels/rules";
import { NO_STORE, levelPlayer, parseSeasonId, reject } from "../../../../src/levels/http";
import { checkClimbIpRateLimit, checkLevelUserTotalRateLimit } from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

/** A query value of 1-5 digits as a number, or null. */
function queryInt(raw: string | null): number | null {
  return raw !== null && /^\d{1,5}$/.test(raw) ? Number(raw) : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const season = parseSeasonId(queryInt(params.get("season")));
  const rawLevel = queryInt(params.get("level"));
  const level = isLevelNumber(rawLevel) ? rawLevel : null;
  if (season === null || level === null) return reject(400, "INVALID_LEVEL", "Unknown season or level");

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const userLimit = await checkLevelUserTotalRateLimit("board", player.uid);
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  if (!catalogLevel(season, level)) return reject(404, "SEASON_NOT_FOUND", "That season is not available");

  try {
    const board = await levelFriendsBoard(player.uid, season, level);
    return NextResponse.json(board, { status: 200, headers: NO_STORE });
  } catch (err) {
    console.error("[levels/board] read failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not load the board");
  }
}
