/**
 * POST /api/duel/[id]/rematch — Create a rematch duel.
 *
 * Both original participants retain their roles; a fresh seed and id are
 * generated. After creating the new duel row the server publishes a "rematch"
 * event on the current duel's Ably channel so the waiting opponent is
 * automatically redirected without pressing Rematch themselves.
 */

import { NextRequest, NextResponse } from "next/server";
import Ably from "ably";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { newRunSeed } from "../../../../../src/game/rng";
import { getDuel, createDuel, recordRematch } from "../../../../../src/db/duel";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth: required
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const duel = await getDuel(id);
    if (!duel) {
      return NextResponse.json({ error: "Duel not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Must be a participant
    const isParticipant = duel.player1_id === uid || duel.player2_id === uid;
    if (!isParticipant) {
      return NextResponse.json(
        { error: "Not a participant in this duel", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Can only rematch a completed duel
    if (duel.status !== "completed") {
      return NextResponse.json(
        { error: "Duel is not yet completed", code: "DUEL_NOT_COMPLETED" },
        { status: 409 }
      );
    }

    const newId = nanoid(8);
    const newSeed = newRunSeed();

    // Preserve original player1/player2 assignment
    await createDuel(duel.player1_id, duel.category_slug, newId, newSeed);

    // Persist the pointer so the opponent can discover the new room by polling
    // meta — the drop-safe fallback for the fire-and-forget event below.
    await recordRematch(id, newId);

    // Notify the waiting opponent via Ably so they navigate without pressing
    // Rematch themselves. Fire-and-forget: a publish failure is non-fatal since
    // both players can still find the new room by refreshing.
    try {
      const ablyRest = new Ably.Rest(process.env.ABLY_API_KEY!);
      await ablyRest.channels.get(`duel:${id}`).publish("rematch", { newDuelId: newId });
    } catch {
      // Non-fatal: the pressing player is already redirected; the opponent will
      // see the rematch button remain available and can press it independently.
    }

    return NextResponse.json({ newDuelId: newId });
  } catch (err) {
    console.error("[POST /api/duel/[id]/rematch]", err);
    return NextResponse.json(
      { error: "Could not create a rematch. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
