/**
 * POST /api/climb/daily/result — submit a Daily Climb run for today's board.
 *
 * Trust boundary (context/trust.md #1): the daily best is monotonic within a
 * day and public, so the stored height is SERVER-DERIVED. The request must
 * carry a replay token (seed + per-tick inputs). The server:
 *
 *   1. decides the day from ITS clock and the replay's seed — today's tower,
 *      or yesterday's only within DAILY_SUBMIT_GRACE_MS of the UTC reset —
 *      and applies the per-user limit, both BEFORE inflating the input log
 *      (which is output-capped at MAX_SHARE_TICKS bytes);
 *   2. re-simulates the inputs on that tower (src/game/dailyVerify.ts) and
 *      stores the re-simulated peak — a client/server mismatch is rejected
 *      (400, logged), never averaged or trusted;
 *   3. upserts the day's best atomically and raises the all-time record
 *      (recordClimb) with the same server peak.
 *
 * Auth mirrors /api/climb/result: no token, an anonymous session, or no
 * leaderboard consent → 200 { saved: false, reason } (the run is still a
 * valid run; there is just nothing to save it against).
 *
 * Request:  { replayToken: string (required), peakY?: number, ticks?: number, seed?: string }
 * 200:      { saved: true, day, peakY, improved, rank, totalClimbers, attempts }
 *         | { saved: false, reason: "anonymous" | "invalid_token" | "no_consent" }
 * 400:      { error, code: INVALID_JSON | REPLAY_REQUIRED | INVALID_REPLAY
 *                         | DAY_CLOSED | RUN_TOO_LONG | REPLAY_MISMATCH }
 * 429:      { error, code: RATE_LIMITED }
 * 500:      { saved: false, reason: "persist_error" }
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { verifyIdToken } from "../../../../../src/lib/firebaseAdmin";
import { ensureUser } from "../../../../../src/db/user";
import { prisma } from "../../../../../src/db/client";
import { recordClimb } from "../../../../../src/db/climb";
import {
  dailyClimberCount,
  dailyLeaderboardTag,
  dailyStandingFor,
  recordDailyClimb,
} from "../../../../../src/db/dailyClimb";
import { FREE_STACK_SLUG } from "../../../../../src/game/freeStack";
import { parseReplayToken, parseRunReplayEnvelope } from "../../../../../src/game/runReplay";
import { inflateReplayEnvelope } from "../../../../../src/game/runReplayServer";
import { DAILY_SIM_VERSION, verifyDailyReplay } from "../../../../../src/game/dailyVerify";
import { submissionDayForSeed } from "../../../../../src/lib/dailyDay";
import {
  checkClimbIpRateLimit,
  checkDailyResultUserRateLimit,
} from "../../../../../src/lib/climbRateLimit";
import { revalidateClimbLeaderboard } from "../../../../../src/lib/revalidateClimbLeaderboard";

export const runtime = "nodejs";

// revalidateTag profile that expires the tag now, so the next board read
// misses the cache instead of serving one more stale response.
const IMMEDIATE_EXPIRY = { expire: 0 } as const;

const NO_STORE = { "Cache-Control": "private, no-store" };

interface Body {
  replayToken?: unknown;
  peakY?: unknown;
}

function reject(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status, headers: NO_STORE });
}

function notSaved(reason: string): NextResponse {
  return NextResponse.json({ saved: false, reason }, { status: 200, headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return reject(400, "INVALID_JSON", "Invalid JSON");
  }
  if (typeof body !== "object" || body === null) {
    return reject(400, "INVALID_JSON", "Invalid JSON");
  }

  const replayToken = parseReplayToken(body.replayToken);
  if (!replayToken) {
    return reject(400, "REPLAY_REQUIRED", "A replay is required for the daily board");
  }
  const claimedPeakY =
    typeof body.peakY === "number" && Number.isFinite(body.peakY) ? body.peakY : null;

  const ipLimit = await checkClimbIpRateLimit(request);
  if (!ipLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  // Identity before any expensive work: an anonymous caller has nothing to
  // save, so it never costs a decode or a re-simulation.
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return notSaved("anonymous");

  let uid: string;
  let email: string | undefined;
  let emailVerified = false;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
    emailVerified = decoded.email_verified ?? false;
  } catch {
    return notSaved("invalid_token");
  }
  // Anonymous Firebase sessions have no email, so no users row to save against.
  if (!email) return notSaved("anonymous");

  // The envelope (seed, claimed peak) parses without inflating the inputs, so
  // the cheap day check and the per-user limiter run before any decompression.
  const envelope = parseRunReplayEnvelope(replayToken);
  if (!envelope) return reject(400, "INVALID_REPLAY", "Replay could not be decoded");

  const now = new Date();
  const day = submissionDayForSeed(envelope.seed, now);
  if (day === null) return reject(400, "DAY_CLOSED", "That daily tower is closed");

  const userLimit = await checkDailyResultUserRateLimit(uid, day);
  if (!userLimit.allowed) return reject(429, "RATE_LIMITED", "Too many requests");

  // Output-capped at MAX_SHARE_TICKS bytes (SEC-DC-1: a small token can
  // inflate ~1000x). Longer logs are rejected here, before they are unpacked.
  const replay = inflateReplayEnvelope(envelope);
  if (!replay) return reject(400, "INVALID_REPLAY", "Replay could not be decoded");

  try {
    await ensureUser({ id: uid, email, emailVerified });
    const dbUser = await prisma.user.findUnique({
      where: { id: uid },
      select: { leaderboard_consent_at: true },
    });
    if (!dbUser?.leaderboard_consent_at) return notSaved("no_consent");
  } catch (err) {
    console.error("[climb/daily/result] user lookup failed:", err);
    return NextResponse.json({ saved: false, reason: "persist_error" }, { status: 500, headers: NO_STORE });
  }

  const verdict = verifyDailyReplay(replay, claimedPeakY, now);
  if (!verdict.ok) {
    if (verdict.code === "REPLAY_MISMATCH") {
      // Logged: a mismatch is either an engine desync (deploy mid-day) or a
      // forged claim, and both need to be visible.
      console.warn("[climb/daily/result] replay mismatch", {
        uid,
        day,
        claimedPeakY,
        tokenPeakY: replay.peakY,
        serverPeakY: verdict.serverPeakY,
        ticks: replay.inputs.length,
      });
    }
    return reject(400, verdict.code, verdict.reason);
  }

  try {
    const [daily] = await Promise.all([
      recordDailyClimb({
        userId: uid,
        day: verdict.day,
        peakY: verdict.peakY,
        ticks: verdict.ticks,
        replayToken,
        simVersion: DAILY_SIM_VERSION,
      }),
      recordClimb({
        userId: uid,
        categorySlug: FREE_STACK_SLUG,
        peakY: verdict.peakY,
        finished: verdict.finished,
        finishedTick: verdict.ticks,
        seed: replay.seed,
        replayToken,
      }),
    ]);
    revalidateTag(dailyLeaderboardTag(verdict.day), IMMEDIATE_EXPIRY);
    revalidateClimbLeaderboard();

    const [standing, totalClimbers] = await Promise.all([
      dailyStandingFor(uid, verdict.day),
      dailyClimberCount(verdict.day),
    ]);
    return NextResponse.json(
      {
        saved: true,
        day: verdict.day,
        peakY: daily.peakY,
        improved: daily.improved,
        rank: standing?.rank ?? null,
        totalClimbers,
        attempts: daily.attempts,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (err) {
    console.error("[climb/daily/result] persist failed:", err);
    return NextResponse.json({ saved: false, reason: "persist_error" }, { status: 500, headers: NO_STORE });
  }
}
