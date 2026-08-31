/**
 * POST /api/climb/result — record a solo climb run (Tower v3 "The Climb").
 *
 * Anonymous play is allowed (spec-next.md Phase 1: no login wall). If a valid
 * Firebase Bearer token is present, the run is persisted and the player's
 * permanent, MONOTONIC peak-height record is updated (AC-30/AC-31). If no token
 * is present, the run is accepted but not saved ({ saved: false }) — this keeps
 * the free MVP playable without an account.
 *
 * Server trust boundary: peakY is self-reported by the client, and
 * src/db/climb.ts persists it monotonically onto one allow-listed board
 * (mobile | desktop). It feeds that board's PUBLIC ranking and cannot be
 * lowered once written. Invalid board values are rejected; omitted board
 * is mobile (the product default). Until peakY is re-derived server-side
 * from seed + input log the way ranked play is specified to be (AC-17),
 * it is bounded by what the simulation can physically produce in the
 * claimed number of ticks. See src/game/scoreBounds.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../../src/lib/firebaseAdmin";
import { recordClimb } from "../../../../src/db/climb";
import { FREE_STACK_SLUG } from "../../../../src/game/freeStack";
import { ensureUser } from "../../../../src/db/user";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { checkClimbResult } from "../../../../src/game/scoreBounds";
import { MAX_REPLAY_TOKEN_LENGTH } from "../../../../src/game/runReplay";
import { revalidateClimbLeaderboard } from "../../../../src/lib/revalidateClimbLeaderboard";
import {
  DEFAULT_CLIMB_BOARD,
  parseClimbBoard,
  type ClimbBoard,
} from "../../../../src/game/climbBoard";

export const runtime = "nodejs";

// Climb runs finish frequently, so keep the cap high. Keyed by client IP since
// most play is anonymous. Fails OPEN so a Redis outage never blocks play.
const CLIMB_RATE_MAX = 60;
const CLIMB_RATE_WINDOW_SECONDS = 60;

interface Body {
  categorySlug?: unknown;
  peakY?: unknown;
  finished?: unknown;
  finishedTick?: unknown;
  /** Elapsed run length in ticks. Bounds peakY; see src/game/scoreBounds. */
  ticks?: unknown;
  seed?: unknown;
  replayToken?: unknown;
  /** Play surface. Allow-listed; omit → mobile. Invalid → 400. */
  board?: unknown;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate the payload shape (never trust the client).
  // categorySlug is optional — all records go to the free stack leaderboard.
  const categorySlug =
    typeof body.categorySlug === "string" ? body.categorySlug : FREE_STACK_SLUG;
  const peakY = typeof body.peakY === "number" && Number.isFinite(body.peakY) ? body.peakY : null;
  const finished = body.finished === true;
  const finishedTick =
    typeof body.finishedTick === "number" && Number.isFinite(body.finishedTick)
      ? body.finishedTick
      : null;
  const seed = typeof body.seed === "string" ? body.seed : null;
  // Runs stashed in sessionStorage before `ticks` existed only carry
  // finishedTick. The sim now stamps finishedTick on elimination, so a client
  // from this build always has a real value; a stale stash with neither is
  // rejected by checkClimbResult rather than unbounded.
  const ticks =
    typeof body.ticks === "number" && Number.isFinite(body.ticks)
      ? body.ticks
      : finishedTick;

  if (peakY === null || !seed) {
    return NextResponse.json({ error: "Invalid climb result" }, { status: 400 });
  }

  const board = parseBoardField(body.board);
  if (board === "invalid") {
    return NextResponse.json(
      { error: "Invalid climb board", code: "INVALID_BOARD" },
      { status: 400 }
    );
  }

  // Reject anything the simulation could not have produced in the claimed run
  // length. This is a damage bound, not proof the score is honest — see the
  // module docblock in src/game/scoreBounds.
  const plausible = checkClimbResult(peakY, ticks);
  if (!plausible.ok) {
    return NextResponse.json(
      { error: "Implausible climb result", code: "IMPLAUSIBLE_RESULT" },
      { status: 400 }
    );
  }
  // After a successful bound, ticks is the number we actually used. Persist
  // that, not a separate client field that the sim used to leave null.
  const elapsedTicks = ticks as number;
  const replayToken = parseReplayToken(body.replayToken);

  // Rate limit by client IP (most play is anonymous). Fails OPEN so a Redis
  // outage never blocks a free run.
  const rl = await checkRateLimit({
    namespace: "climb",
    identifier: `ip:${clientIp(request)}`,
    max: CLIMB_RATE_MAX,
    windowSeconds: CLIMB_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  // Auth is optional for solo. Present + valid → save; absent → play, no save.
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ saved: false, reason: "anonymous" }, { status: 200 });
  }

  let uid: string;
  let email: string | undefined;
  let emailVerified = false;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
    emailVerified = decoded.email_verified ?? false;
  } catch {
    // A bad token on a solo run should not fail the run — just skip saving.
    return NextResponse.json({ saved: false, reason: "invalid_token" }, { status: 200 });
  }

  // Anonymous Firebase sessions have no email; we can't create a `users` row
  // (users.email is NOT NULL/unique), so there's nothing to persist against.
  if (!email) {
    return NextResponse.json({ saved: false, reason: "anonymous" }, { status: 200 });
  }

  try {
    // Self-heal: the climb tables FK to users(id). A user who signed in via a
    // path that didn't provision their row (Google OAuth, returning sign-in)
    // would otherwise hit a FK violation here. Upsert the row from the verified
    // token before recording so saves succeed regardless of sign-in path.
    await ensureUser({ id: uid, email, emailVerified });

    const result = await recordClimb({
      userId: uid,
      categorySlug,
      peakY,
      finished,
      finishedTick: elapsedTicks,
      seed,
      replayToken,
      board,
    });
    revalidateClimbLeaderboard();
    return NextResponse.json({ saved: true, ...result }, { status: 200 });
  } catch (err) {
    console.error("[climb/result] persist failed:", err);
    return NextResponse.json({ saved: false, reason: "persist_error" }, { status: 500 });
  }
}

function parseReplayToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_REPLAY_TOKEN_LENGTH) return null;
  return trimmed;
}

/**
 * Omit / null → mobile (old clients and the product default). Anything else must
 * be on the allow-list; we do not coerce "desktooo" onto a ranking.
 */
function parseBoardField(raw: unknown): ClimbBoard | "invalid" {
  if (raw === undefined || raw === null) return DEFAULT_CLIMB_BOARD;
  return parseClimbBoard(raw) ?? "invalid";
}
