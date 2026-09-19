/**
 * POST /api/challenge/[id]/accept — Accept a challenge, creating a duel.
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { acceptChallenge, linkDuelToChallenge } from "../../../../../src/db/challenge";
import { createNotification } from "../../../../../src/db/notification";
import { createDuel } from "../../../../../src/db/duel";
import { newRunSeed } from "../../../../../src/game/rng";

export const runtime = "nodejs";

export async function POST(
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

  const rl = await checkRateLimit({
    namespace: "challenge:accept",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await acceptChallenge(id, uid);

    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Challenge not found", code: "NOT_FOUND" }, { status: 404 });
      case "not_recipient":
        return NextResponse.json({ error: "Not your challenge to accept", code: "FORBIDDEN" }, { status: 403 });
      case "not_pending":
        return NextResponse.json({ error: "Challenge is no longer pending", code: "NOT_PENDING" }, { status: 409 });
      case "accepted": {
        const c = result.challenge;

        const duelId = nanoid(8);
        const seed = newRunSeed();
        await createDuel(c.sender_id, c.category_slug, duelId, seed, {
          player2Id: uid,
          status: "active",
        });
        await linkDuelToChallenge(c.id, duelId);

        const recipientName = c.recipient.display_name ?? c.recipient.username ?? "Your opponent";
        await createNotification({
          userId: c.sender_id,
          type: "challenge_accepted",
          title: "Challenge accepted!",
          body: `${recipientName} accepted your challenge. The duel is ready!`,
          data: { challengeId: c.id, duelId, recipientName },
        }).catch((err) => {
          console.error("[POST /api/challenge/accept] notification error:", err);
        });

        return NextResponse.json({ accepted: true, duelId }, { status: 200 });
      }
    }
  } catch (err) {
    console.error("[POST /api/challenge/accept] error:", err);
    return NextResponse.json(
      { error: "Could not accept challenge. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
