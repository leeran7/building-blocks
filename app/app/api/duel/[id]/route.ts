/**
 * GET /api/duel/[id] — Duel metadata.
 *
 * Public endpoint — no auth required. The seed is withheld when the duel is
 * still pending (AC spec: seed oracle prevention — player2 must not be able
 * to pre-compute the tower before joining).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDuel } from "../../../../src/db/duel";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const duel = await getDuel(id);
  if (!duel) {
    return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Omit seed while pending — seed oracle prevention (R-5)
  const seed = duel.status === "pending" ? undefined : duel.seed;

  return NextResponse.json({
    id: duel.id,
    status: duel.status,
    categorySlug: duel.category_slug,
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
