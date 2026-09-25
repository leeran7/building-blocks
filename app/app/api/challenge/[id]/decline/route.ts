/**
 * POST /api/challenge/[id]/decline — Decline a challenge.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { declineChallenge, getChallenge } from "../../../../../src/db/challenge";
import { createNotification } from "../../../../../src/db/notification";
import { climberDisplay } from "../../../../../src/lib/handle";

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
    namespace: "challenge:decline",
    identifier: uid,
    max: 60,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const challengeBefore = await getChallenge(id);
    const result = await declineChallenge(id, uid);

    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Challenge not found", code: "NOT_FOUND" }, { status: 404 });
      case "not_recipient":
        return NextResponse.json({ error: "Not your challenge to decline", code: "FORBIDDEN" }, { status: 403 });
      case "not_pending":
        return NextResponse.json({ error: "Challenge is no longer pending", code: "NOT_PENDING" }, { status: 409 });
      case "declined": {
        if (challengeBefore) {
          // Same identity rule as challenge_received / challenge_accepted: the
          // decliner is the recipient, named by display name or pseudonym.
          const declinerName = climberDisplay(
            challengeBefore.recipient.id,
            challengeBefore.recipient.display_name,
            challengeBefore.recipient.avatar_id
          );
          await createNotification({
            userId: challengeBefore.sender_id,
            type: "challenge_declined",
            title: "Challenge declined",
            body: `${declinerName} declined your challenge.`,
            data: { challengeId: id },
          }).catch((err) => {
            console.error("[POST /api/challenge/decline] notification error:", err);
          });
        }
        return NextResponse.json({ declined: true }, { status: 200 });
      }
    }
  } catch (err) {
    console.error("[POST /api/challenge/decline] error:", err);
    return NextResponse.json(
      { error: "Could not decline challenge. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
