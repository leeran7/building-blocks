/**
 * POST /api/levels/result — submit a level run (mobile Level System, design §7).
 *
 * Trust boundary (context/trust.md #1): stars, best time, XP and the life
 * refund are permanent or gate play, so all of them are SERVER-DERIVED. The
 * request carries only the ticket id and the replay (seed + per-tick inputs).
 * The server:
 *
 *   1. loads the caller's own open ticket, which names the level and the
 *      engine and spec versions (nothing about the level is read from the
 *      request), and applies the per-user limit, before any decompression;
 *   2. inflates the input log with its output capped at MAX_SHARE_TICKS and
 *      re-simulates it on the ticket's level (getLevelCatalog().verify),
 *      taking the finish tick, and so the stars, from the server's own run;
 *   3. in one transaction under the user's row lock (src/db/levels.ts):
 *      claims the cleared run's input hash (409 REPLAY_REUSED on another
 *      account's run), consumes the ticket once, refunds the life on a clear
 *      or a bad start, raises stars / best time, and pays new XP keys.
 *
 * Request:  { ticketId: string, replayToken: string }
 * 200:      LevelResult (src/db/levels.ts) with dates as ISO strings
 * 400:      { error, code: INVALID_JSON | INVALID_TICKET | REPLAY_REQUIRED
 *                         | INVALID_REPLAY | RUN_TOO_LONG | REPLAY_MISMATCH
 *                         | WRONG_LEVEL }
 * 401:      { error, code: UNAUTHORIZED }
 * 404:      { error, code: TICKET_NOT_FOUND }
 * 409:      { error, code: TICKET_USED | REPLAY_REUSED | SIM_VERSION_MISMATCH }
 * 410:      { error, code: TICKET_EXPIRED }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { error, code: PERSIST_ERROR }
 * 503:      { error, code: LEVELS_UNAVAILABLE }
 */

import { NextRequest, NextResponse } from "next/server";

import { LevelError, openTicketSpec, submitLevelResult } from "../../../../src/db/levels";
import { getLevelCatalog, type LevelTicketSpec } from "../../../../src/levels/catalog";
import {
  NO_STORE,
  levelErrorResponse,
  levelPlayer,
  parseTicketId,
  readJsonObject,
  reject,
} from "../../../../src/levels/http";
import { parseReplayToken, parseRunReplayEnvelope } from "../../../../src/game/runReplay";
import { inflateReplayEnvelope } from "../../../../src/game/runReplayServer";
import { checkClimbIpRateLimit, checkLevelUserRateLimit } from "../../../../src/lib/climbRateLimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body) return reject(400, "INVALID_JSON", "Invalid JSON");

  const ticketId = parseTicketId(body.ticketId);
  if (!ticketId) return reject(400, "INVALID_TICKET", "A run ticket is required");
  const replayToken = parseReplayToken(body.replayToken);
  if (!replayToken) return reject(400, "REPLAY_REQUIRED", "A replay is required");

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  const catalog = getLevelCatalog();
  if (!catalog) return reject(503, "LEVELS_UNAVAILABLE", "Levels are not available yet");

  const player = await levelPlayer(request);
  if (player instanceof NextResponse) return player;

  const now = new Date();
  let ticket: LevelTicketSpec;
  try {
    ticket = await openTicketSpec(player.uid, ticketId, now);
  } catch (err) {
    if (err instanceof LevelError) return levelErrorResponse(err);
    console.error("[levels/result] ticket lookup failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not save the run");
  }

  const userLimit = await checkLevelUserRateLimit("result", player.uid, ticket.season, ticket.level);
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  // The ticket was issued under the engine then running. If the server has
  // since moved to another engine it cannot reproduce the run.
  if (ticket.simVersion !== catalog.simVersion) {
    return reject(409, "SIM_VERSION_MISMATCH", "Update the app to play levels");
  }

  // Envelope first (no inflation), then the capped inflate (SEC-DC-1).
  const envelope = parseRunReplayEnvelope(replayToken);
  const replay = envelope ? inflateReplayEnvelope(envelope) : null;
  if (!replay) return reject(400, "INVALID_REPLAY", "Replay could not be decoded");

  const verdict = catalog.verify(ticket, replay);
  if (!verdict.ok) {
    if (verdict.code === "REPLAY_MISMATCH" || verdict.code === "WRONG_LEVEL") {
      console.warn("[levels/result] replay rejected", {
        uid: player.uid,
        season: ticket.season,
        level: ticket.level,
        code: verdict.code,
        ticks: replay.inputs.length,
      });
    }
    return reject(400, verdict.code, verdict.reason);
  }

  try {
    const result = await submitLevelResult({ userId: player.uid, ticketId, verdict, replayToken, now });
    return NextResponse.json(
      { ...result, nextLifeAt: result.nextLifeAt?.toISOString() ?? null },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    if (err instanceof LevelError) {
      if (err.code === "REPLAY_REUSED") {
        console.warn("[levels/result] replay reused", { uid: player.uid, level: ticket.level });
      }
      return levelErrorResponse(err);
    }
    console.error("[levels/result] persist failed:", err);
    return reject(500, "PERSIST_ERROR", "Could not save the run");
  }
}
