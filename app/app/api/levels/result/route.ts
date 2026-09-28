/**
 * POST /api/levels/result — record a level run (mobile Level System, design §5).
 *
 * Levels have NO replay verification (Leeran, 2026-09-27). The device reports
 * the result and the server sanity-checks it:
 *
 *   - the ticket is the caller's own, open and unexpired, and names the level
 *     (nothing about the level is read from the request);
 *   - the result is well-formed: a clear has 1-3 stars, a fail has 0, and
 *     ticks is an integer up to MAX_RUN_TICKS (parseReportedRun);
 *   - a clear's stars are the ones its ticks earn against the level's pars in
 *     the season manifest (src/levels/catalog.ts starsForTicks). A clear past the
 *     level's clock earns none, so it is refused;
 *   - the run fits the time since the ticket was issued (runFitsWallClock).
 *
 * Then, in one transaction under the user's row lock (src/db/levels.ts), the
 * ticket is consumed once, the life is refunded on a clear or a bad start,
 * stars and best time only rise, and each XP key pays once. A modified client
 * can still claim clears and stars it did not earn; that is accepted for
 * levels, which carry no prizes.
 *
 * Request:  { ticketId: string, cleared: boolean, stars: 0-3, ticks: number,
 *             replayToken?: string }  (replayToken: the run, kept for ghosts)
 * 200:      LevelResult (src/db/levels.ts) with dates as ISO strings
 * 400:      { error, code: INVALID_JSON | INVALID_TICKET | INVALID_RESULT
 *                         | IMPLAUSIBLE_RUN }
 * 401:      { error, code: UNAUTHORIZED }
 * 404:      { error, code: TICKET_NOT_FOUND | SEASON_NOT_FOUND }
 * 409:      { error, code: TICKET_USED }
 * 410:      { error, code: TICKET_EXPIRED }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 */

import { NextRequest, NextResponse } from "next/server";

import { LevelError, openTicketLevel, submitLevelResult } from "../../../../src/db/levels";
import { parseReportedRun } from "../../../../src/levels/rules";
import { catalogLevel, starsForTicks } from "../../../../src/levels/catalog";
import {
  NO_STORE,
  levelErrorResponse,
  levelPlayer,
  parseTicketId,
  readJsonObject,
  reject,
} from "../../../../src/levels/http";
import { parseReplayToken } from "../../../../src/game/runReplay";
import {
  checkClimbIpRateLimit,
  checkLevelUserRateLimit,
  checkLevelUserTotalRateLimit,
} from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body) return reject(400, "INVALID_JSON", "Invalid JSON");

  const ticketId = parseTicketId(body.ticketId);
  if (!ticketId) return reject(400, "INVALID_TICKET", "A run ticket is required");
  const run = parseReportedRun(body);
  if (!run) return reject(400, "INVALID_RESULT", "The run result is incomplete or inconsistent");
  // Optional, stored unverified with the best run for friend ghosts. A value
  // that is present but not a replay token is refused, never dropped.
  let replayToken: string | null = null;
  if (body.replayToken !== undefined && body.replayToken !== null) {
    replayToken = parseReplayToken(body.replayToken);
    if (!replayToken) return reject(400, "INVALID_RESULT", "The replay could not be read");
  }

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const now = new Date();
  let ticket: { season: number; level: number };
  try {
    ticket = await openTicketLevel(player.uid, ticketId, now);
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/result] ticket lookup failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not save the run");
  }

  const totalLimit = await checkLevelUserTotalRateLimit("result", player.uid);
  const userLimit = totalLimit.allowed
    ? await checkLevelUserRateLimit("result", player.uid, ticket.season, ticket.level)
    : totalLimit;
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const row = catalogLevel(ticket.season, ticket.level);
  if (!row) return reject(404, "SEASON_NOT_FOUND", "That season is not available");
  // Refused before the transaction, so the ticket stays open.
  if (run.cleared && run.stars !== starsForTicks(run.ticks, row.pars)) {
    return reject(400, "INVALID_RESULT", "The stars do not match the finish time");
  }

  try {
    const result = await submitLevelResult({ userId: player.uid, ticketId, run, replayToken, now });
    return NextResponse.json(
      { ...result, nextLifeAt: result.nextLifeAt?.toISOString() ?? null },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) {
      if (err.code === "IMPLAUSIBLE_RUN") {
        console.warn("[levels/result] implausible run", { uid: player.uid, level: ticket.level, ticks: run.ticks });
      }
      return levelErrorResponse(err);
    }
    console.error("[levels/result] persist failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not save the run");
  }
}
