/**
 * POST /api/levels/ticket — start a level (mobile Level System, design §5b).
 *
 * Issues a run ticket and, from level 11 on, spends a life. The ticket pins
 * the season, level and engine version on the server; POST /api/levels/result
 * records the run against the ticket, never against a level named in its
 * request.
 *
 * The season must be live (a level_seasons row whose starts_at has passed)
 * AND have a sound generated manifest (src/levels/catalog.ts).
 *
 * Every check that can refuse (unknown or inactive season, stale app) runs
 * BEFORE the transaction that spends the life, so a player never pays for a
 * run the server would not record.
 *
 * Request:  { season: number, level: number, simVersion: number }
 * 200:      { ticketId, season, level, simVersion, rev, pars, expiresAt,
 *             lifeSpent, lives, nextLifeAt, startPowerUp, streak,
 *             failsAtLevel, routeGhostAvailable }
 *            (rev: the level's seed revision; pars: { twoStarTicks,
 *             threeStarTicks, oneStarTicks }, which /result scores stars
 *             against; oneStarTicks is the level's clock, or null;
 *             startPowerUp: { type, source: "streak" | "stuck_help" } | null,
 *             what the run starts with at GO, decided here from server
 *             state only; streak: the win streak after any open ticket was
 *             closed; failsAtLevel / routeGhostAvailable: stuck help, §5c.
 *             The route ghost view itself is not built yet: the flag only
 *             says the player has earned it)
 * 400:      { error, code: INVALID_JSON | INVALID_LEVEL }
 * 401:      { error, code: UNAUTHORIZED }
 * 403:      { error, code: LEVEL_LOCKED, frontier }
 * 404:      { error, code: SEASON_NOT_FOUND }
 * 409:      { error, code: SIM_VERSION_MISMATCH | OUT_OF_LIVES, nextLifeAt? }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { ensureUser } from "../../../../src/db/user";
import { activeLevelSeason, issueLevelTicket, LevelError } from "../../../../src/db/levels";
import { isLevelNumber } from "../../../../src/levels/rules";
import { catalogLevel, levelBoosterTypes } from "../../../../src/levels/catalog";
import {
  NO_STORE,
  levelErrorResponse,
  levelPlayer,
  parseSeasonId,
  readJsonObject,
  reject,
} from "../../../../src/levels/http";
import { LEVEL_SIM_VERSION } from "../../../../src/game/simVersion";
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

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const totalLimit = await checkLevelUserTotalRateLimit("ticket", player.uid);
  const userLimit = totalLimit.allowed
    ? await checkLevelUserRateLimit("ticket", player.uid, season, level)
    : totalLimit;
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const now = new Date();
  let active: Awaited<ReturnType<typeof activeLevelSeason>>;
  try {
    active = await activeLevelSeason(season, now);
  } catch (err) {
    console.error("[levels/ticket] season lookup failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not start the level");
  }
  const row = active ? catalogLevel(season, level) : null;
  const allowedBoosters = active ? levelBoosterTypes(season, level) : null;
  if (!active || !row || !allowedBoosters) return reject(404, "SEASON_NOT_FOUND", "That season is not available");

  // Runs from a different engine are different levels, so a stale app (or a
  // server behind the season's minimum engine) is stopped here, before it
  // spends a life (design §7).
  if (body.simVersion !== LEVEL_SIM_VERSION || LEVEL_SIM_VERSION < active.minLevelSimVersion) {
    return reject(409, "SIM_VERSION_MISMATCH", "Update the app to play levels");
  }

  try {
    await ensureUser({ id: player.uid, email: player.email, emailVerified: player.emailVerified });
    const ticket = await issueLevelTicket({
      userId: player.uid,
      season,
      level,
      simVersion: LEVEL_SIM_VERSION,
      allowedBoosters,
      now,
    });
    return NextResponse.json(
      {
        ticketId: ticket.ticketId,
        season,
        level,
        simVersion: LEVEL_SIM_VERSION,
        rev: row.rev,
        pars: {
          twoStarTicks: row.pars.twoStarTicks,
          threeStarTicks: row.pars.threeStarTicks,
          oneStarTicks: row.pars.oneStarTicks,
        },
        expiresAt: ticket.expiresAt.toISOString(),
        lifeSpent: ticket.lifeSpent,
        lives: ticket.lives,
        nextLifeAt: ticket.nextLifeAt?.toISOString() ?? null,
        startPowerUp: ticket.startPowerUp,
        streak: ticket.streak,
        failsAtLevel: ticket.failsAtLevel,
        routeGhostAvailable: ticket.routeGhostAvailable,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/ticket] persist failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not start the level");
  }
}
