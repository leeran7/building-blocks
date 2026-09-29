/**
 * POST /api/levels/lives — refill lives to full with gems, instead of waiting
 * for the 30-minute timer (mobile Level System, design §5b).
 *
 * The price is LIVES_REFILL_GEMS (src/levels/rules.ts), fixed on the server;
 * the request carries nothing. Refused while lives are full, which is also
 * what keeps a retried request from being charged twice.
 *
 * Request:  {}  (no fields)
 * 200:      { lives, maxLives, nextLifeAt, gems }  (gems: balance after)
 * 401:      { error, code: UNAUTHORIZED }
 * 409:      { error, code: LIVES_FULL, lives }
 *           { error, code: NOT_ENOUGH_GEMS, gems, cost }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { ensureUser } from "../../../../src/db/user";
import { buyLivesRefill, LevelError } from "../../../../src/db/levels";
import { MAX_LIVES } from "../../../../src/levels/rules";
import { NO_STORE, levelErrorResponse, levelPlayer, reject } from "../../../../src/levels/http";
import { checkClimbIpRateLimit, checkLevelUserTotalRateLimit } from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const userLimit = await checkLevelUserTotalRateLimit("lives", player.uid);
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  try {
    await ensureUser({ id: player.uid, email: player.email, emailVerified: player.emailVerified });
    const refill = await buyLivesRefill(player.uid, new Date());
    return NextResponse.json(
      {
        lives: refill.lives,
        maxLives: MAX_LIVES,
        nextLifeAt: refill.nextLifeAt?.toISOString() ?? null,
        gems: refill.gems,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/lives] refill failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not refill lives");
  }
}
