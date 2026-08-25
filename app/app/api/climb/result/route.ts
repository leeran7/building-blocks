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
  const categorySlug = typeof body.categorySlug === "string" ? body.categorySlug : null;
  const peakY = typeof body.peakY === "number" && Number.isFinite(body.peakY) ? body.peakY : null;
  const finished = body.finished === true;
  const finishedTick =
    typeof body.finishedTick === "number" && Number.isFinite(body.finishedTick)
      ? body.finishedTick
      : null;
  const seed = typeof body.seed === "string" ? body.seed : null;

  if (!categorySlug || peakY === null || peakY < 0 || !seed) {
    return NextResponse.json({ error: "Invalid climb result" }, { status: 400 });
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
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    // A bad token on a solo run should not fail the run — just skip saving.
    return NextResponse.json({ saved: false, reason: "invalid_token" }, { status: 200 });
  }

  try {
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
