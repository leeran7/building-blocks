/**
 * GET /api/duel/[id] — Duel metadata.
 *
 * Public endpoint — no auth required. The seed is withheld when the duel is
 * still pending (AC spec: seed oracle prevention — player2 must not be able
 * to pre-compute the tower before joining).
 *
 * DELETE /api/duel/[id] — Cancel a pending challenge you created, so the
 * one-pending-challenge-per-user guard on POST /api/duel can't strand you.
 * Auth required; only the creator may cancel, and only while still pending.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDuel, cancelPendingDuel } from "../../../../src/db/duel";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { verifyIdToken } from "../../../../src/lib/firebaseAdmin";
import { clientIp } from "../../../../src/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Resolve the caller's stable duel identity: their Firebase uid when signed in
 * (non-anonymous), otherwise the IP-derived "guest:<ip>" used by the join and
 * realtime-token routes. Returning this lets the client key slot detection, the
 * Ably clientId, and result submission off the SAME id the server stores, so a
 * guest challenge-link flow works end to end.
 */
async function resolveYouId(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      if (decoded.firebase?.sign_in_provider !== "anonymous") return decoded.uid;
    } catch {
      // fall through to guest
    }
  }
  return `guest:${clientIp(request)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const duel = await getDuel(id);
  if (!duel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const youId = await resolveYouId(request);

  // Omit seed while pending — seed oracle prevention (R-5)
  const seed = duel.status === "pending" ? undefined : duel.seed;

  return NextResponse.json({
    id: duel.id,
    status: duel.status,
    categorySlug: duel.category_slug,
    youId,
    ...(seed !== undefined ? { seed } : {}),
    player1: duel.player1
      ? { id: duel.player1.id, displayName: duel.player1.display_name }
      : null,
    player2: duel.player2
      ? { id: duel.player2.id, displayName: duel.player2.display_name }
      : null,
    winnerId: duel.winner_id ?? null,
    player1Peak: duel.player1_peak ?? null,
    player2Peak: duel.player2_peak ?? null,
    forfeit: duel.forfeit ?? false,
    tiebreakRule: duel.tiebreak_rule ?? null,
    startedAt: duel.started_at?.toISOString() ?? null,
    completedAt: duel.completed_at?.toISOString() ?? null,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await cancelPendingDuel(id, uid);
  switch (result.outcome) {
    case "cancelled":
      return NextResponse.json({ cancelled: true }, { status: 200 });
    case "not_found":
      return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
    case "forbidden":
      return NextResponse.json(
        { error: "Not your challenge", code: "FORBIDDEN" },
        { status: 403 }
      );
    case "not_pending":
      return NextResponse.json(
        { error: "Challenge already started", code: "NOT_PENDING" },
        { status: 409 }
      );
  }
}
