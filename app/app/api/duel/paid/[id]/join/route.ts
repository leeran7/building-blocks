/**
 * POST /api/duel/paid/[id]/join — stake credits to accept a paid challenge.
 *
 * Binds the invitee as player2, debits their stake, and flips the duel to
 * `active` — all in ONE SELECT FOR UPDATE transaction, so both stakes are held
 * in escrow the instant the match starts, with no Stripe round-trip or
 * both-paid webhook to wait on. The seed is revealed via GET meta once active.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "../../../../../../src/lib/rateLimit";
import { guardPaidDuelRequest } from "../../../../../../src/lib/paidDuelGuards";
import { recordAgeConfirmation } from "../../../../../../src/db/user";
import {
  joinPaidDuel,
  getActivePaidDuelForUser,
  type JoinPaidCode,
} from "../../../../../../src/db/duel";
import { InsufficientCreditsError } from "../../../../../../src/db/credits";

export const runtime = "nodejs";

const RATE_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;

const BodySchema = z.object({ ageConfirmed: z.literal(true) });

/** Map the shared join outcome codes to user-facing messages + HTTP status. */
const JOIN_FAILURES: Record<JoinPaidCode, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "Duel not found" },
  NOT_PAID: { status: 400, message: "This is not a paid duel" },
  NOT_PENDING: { status: 409, message: "This challenge is no longer open" },
  SELF_JOIN: { status: 409, message: "You cannot join your own challenge" },
  ALREADY_TAKEN: { status: 409, message: "Someone else already joined this challenge" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: `duel:paid:join:${id}`,
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!BodySchema.safeParse(body).success) {
    return NextResponse.json(
      { error: "You must confirm you are 18+", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  await recordAgeConfirmation(uid);

  // Already mid-match? Don't let a second stake go down while one is in play.
  const activeDuel = await getActivePaidDuelForUser(uid);
  if (activeDuel) {
    return NextResponse.json(
      { error: "You already have an active paid duel", code: "DUEL_ALREADY_ACTIVE", duelId: activeDuel.id },
      { status: 409 }
    );
  }

  try {
    const outcome = await joinPaidDuel(id, uid);
    if (!outcome.ok) {
      const f = JOIN_FAILURES[outcome.code];
      return NextResponse.json({ error: f.message, code: outcome.code }, { status: f.status });
    }
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Not enough credits", code: "INSUFFICIENT_CREDITS", shortfallCents: err.shortfallCents },
        { status: 402 }
      );
    }
    console.error("[POST /api/duel/paid/[id]/join]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
