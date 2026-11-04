/**
 * POST /api/levels/lives/ad — one life for watching a rewarded ad, when the
 * player is out of lives (design: placement B in the ads plan).
 *
 * The request carries nothing. Whether the player may have the life is
 * server-derived (src/db/levels.ts grantAdLife): only at zero lives, at most
 * AD_LIVES_PER_DAY a UTC day. That the ad was watched is the device's report;
 * those two rules bound what a false report can get. Refusing a player who
 * already has a life is what keeps a retried request from granting twice.
 *
 * Request:  {}  (no fields)
 * 200:      { lives, maxLives, nextLifeAt, adLivesLeft }
 * 401:      { error, code: UNAUTHORIZED }
 * 409:      { error, code: LIVES_AVAILABLE, lives }
 *           { error, code: AD_LIVES_USED, adLivesLeft }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { ensureUser } from "../../../../../src/db/user";
import { grantAdLife, LevelError } from "../../../../../src/db/levels";
import { MAX_LIVES } from "../../../../../src/levels/rules";
import { NO_STORE, levelErrorResponse, levelPlayer, reject } from "../../../../../src/levels/http";
import { checkClimbIpRateLimit, checkLevelUserTotalRateLimit } from "../../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const userLimit = await checkLevelUserTotalRateLimit("adLife", player.uid);
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  try {
    await ensureUser({ id: player.uid, email: player.email, emailVerified: player.emailVerified });
    const grant = await grantAdLife(player.uid, new Date());
    return NextResponse.json(
      {
        lives: grant.lives,
        maxLives: MAX_LIVES,
        nextLifeAt: grant.nextLifeAt?.toISOString() ?? null,
        adLivesLeft: grant.adLivesLeft,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/lives/ad] grant failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not add a life");
  }
}
