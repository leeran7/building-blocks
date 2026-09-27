/**
 * POST /api/levels/ticket — start a level (mobile Level System, design §5b, §7).
 *
 * Issues a run ticket and, from level 11 on, spends a life. The ticket pins
 * the season, level, engine and level-spec versions from the SERVER's own
 * manifest, and POST /api/levels/result verifies the run against the ticket,
 * never against anything the client says about the level.
 *
 * Order matters: every check that can refuse (engine unavailable, unknown
 * season or level, stale app version) runs BEFORE the transaction that spends
 * the life, so a player never pays for a run that could not be verified.
 *
 * Request:  { season: number, level: number, simVersion: number }
 * 200:      { ticketId, season, level, simVersion, specVersion, expiresAt,
 *             lifeSpent, lives, nextLifeAt }
 * 400:      { error, code: INVALID_JSON | INVALID_LEVEL }
 * 401:      { error, code: UNAUTHORIZED }
 * 403:      { error, code: LEVEL_LOCKED, frontier }
 * 404:      { error, code: SEASON_NOT_FOUND | LEVEL_NOT_FOUND }
 * 409:      { error, code: SIM_VERSION_MISMATCH | OUT_OF_LIVES, nextLifeAt? }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 * 503:      { error, code: LEVELS_UNAVAILABLE }
 */

import { NextRequest, NextResponse } from "next/server";

import { ensureUser } from "../../../../src/db/user";
import { activeLevelSeason, issueLevelTicket, LevelError } from "../../../../src/db/levels";
import { getLevelCatalog } from "../../../../src/levels/catalog";
import { isLevelNumber } from "../../../../src/levels/rules";
import {
  NO_STORE,
  levelErrorResponse,
  levelPlayer,
  parseSeasonId,
  readJsonObject,
  reject,
} from "../../../../src/levels/http";
import {
  checkClimbIpRateLimit,
  checkLevelUserRateLimit,
  checkLevelUserTotalRateLimit,
} from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body) return reject(400, "INVALID_JSON", "Invalid JSON");

  const season = parseSeasonId(body.season);
  const level = isLevelNumber(body.level) ? body.level : null;
  if (season === null || level === null) return reject(400, "INVALID_LEVEL", "Unknown season or level");

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const catalog = getLevelCatalog();
  if (!catalog) return reject(503, "LEVELS_UNAVAILABLE", "Levels are not available yet");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const totalLimit = await checkLevelUserTotalRateLimit("ticket", player.uid);
  const userLimit = totalLimit.allowed
    ? await checkLevelUserRateLimit("ticket", player.uid, season, level)
    : totalLimit;
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const seasonInfo = catalog.season(season);
  if (!seasonInfo) return reject(404, "SEASON_NOT_FOUND", "That season is not available");
  if (level > seasonInfo.levelCount) return reject(404, "LEVEL_NOT_FOUND", "That level does not exist");

  const now = new Date();
  let active: Awaited<ReturnType<typeof activeLevelSeason>>;
  try {
    active = await activeLevelSeason(season, now);
  } catch (err) {
    console.error("[levels/ticket] season lookup failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not start the level");
  }
  if (!active) return reject(404, "SEASON_NOT_FOUND", "That season is not available");
  // The activation row pins the manifest it was reviewed with. A server whose
  // own copy differs (or whose engine is too old for the season) must not
  // issue tickets it would verify against the wrong levels.
  if (active.manifestHash !== seasonInfo.manifestHash || catalog.simVersion < active.minLevelSimVersion) {
    console.error("[levels/ticket] season manifest or engine does not match its activation row", {
      season,
      serverSimVersion: catalog.simVersion,
      minLevelSimVersion: active.minLevelSimVersion,
    });
    return reject(503, "LEVELS_UNAVAILABLE", "Levels are not available right now");
  }

  // A different engine cannot reproduce this run, so a stale app is told to
  // update here, before it spends a life (design §7).
  if (body.simVersion !== catalog.simVersion) {
    return reject(409, "SIM_VERSION_MISMATCH", "Update the app to play levels");
  }

  const specVersion = seasonInfo.specVersion(level);
  try {
    await ensureUser({ id: player.uid, email: player.email, emailVerified: player.emailVerified });
    const ticket = await issueLevelTicket({
      userId: player.uid,
      season,
      level,
      simVersion: catalog.simVersion,
      specVersion,
      now,
    });
    return NextResponse.json(
      {
        ticketId: ticket.ticketId,
        season,
        level,
        simVersion: catalog.simVersion,
        specVersion,
        expiresAt: ticket.expiresAt.toISOString(),
        lifeSpent: ticket.lifeSpent,
        lives: ticket.lives,
        nextLifeAt: ticket.nextLifeAt?.toISOString() ?? null,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/ticket] persist failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not start the level");
  }
}
