/**
 * POST /api/climb/result — record a solo climb run (Tower v3 "The Climb").
 *
 * Anonymous play is allowed (spec-next.md Phase 1: no login wall). If a valid
 * Firebase Bearer token is present, the run is persisted and the player's
 * permanent, MONOTONIC peak-height record is updated (AC-30/AC-31). If no token
 * is present, the run is accepted but not saved ({ saved: false }) — this keeps
 * the free MVP playable without an account.
 *
 * Server trust boundary: peakY here is a self-reported SOLO result and is only
 * used for the player's own record — it never affects other players and never
 * pays out. Ranked results (which DO pay out) are re-simulated server-side from
 * seed + input log, not trusted from the client (AC-17); that path is separate.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../../src/lib/firebaseAdmin";
import { recordClimb } from "../../../../src/db/climb";
import { FREE_STACK_SLUG } from "../../../../src/game/freeStack";
import { ensureUser } from "../../../../src/db/user";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";

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
  seed?: unknown;
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

  if (peakY === null || peakY < 0 || !seed) {
    return NextResponse.json({ error: "Invalid climb result" }, { status: 400 });
  }

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
      finishedTick,
      seed,
    });
    return NextResponse.json({ saved: true, ...result }, { status: 200 });
  } catch (err) {
    console.error("[climb/result] persist failed:", err);
    return NextResponse.json({ saved: false, reason: "persist_error" }, { status: 500 });
  }
}
