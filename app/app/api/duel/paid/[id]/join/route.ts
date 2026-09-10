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
import { prisma } from "../../../../../../src/db/client";
import { stakeInTx, InsufficientCreditsError } from "../../../../../../src/db/credits";
import { DuelStatus } from "@prisma/client";

export const runtime = "nodejs";

const RATE_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;

const BodySchema = z.object({ ageConfirmed: z.literal(true) });

/** Discriminated failure so the transaction can reject with a precise HTTP code. */
type JoinFailure =
  | { code: "NOT_FOUND"; status: 404 }
  | { code: "NOT_PAID"; status: 400 }
  | { code: "NOT_PENDING"; status: 409 }
  | { code: "SELF_JOIN"; status: 409 }
  | { code: "ALREADY_TAKEN"; status: 409 };

class JoinError extends Error {
  constructor(public readonly failure: JoinFailure) {
    super(failure.code);
  }
}

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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;
      const duel = await tx.duel.findUnique({ where: { id } });

      if (!duel) throw new JoinError({ code: "NOT_FOUND", status: 404 });
      if (duel.stake_cents == null) throw new JoinError({ code: "NOT_PAID", status: 400 });
      if (duel.player1_id === uid) throw new JoinError({ code: "SELF_JOIN", status: 409 });
      if (duel.status !== DuelStatus.pending) {
        throw new JoinError({ code: "NOT_PENDING", status: 409 });
      }
      // Allow the same invitee to resume an interrupted join; block a different one.
      if (duel.player2_id !== null && duel.player2_id !== uid) {
        throw new JoinError({ code: "ALREADY_TAKEN", status: 409 });
      }

      const split = await stakeInTx(tx, uid, duel.stake_cents, id);

      await tx.duel.update({
        where: { id },
        data: {
          player2_id: uid,
          player2_staked: true,
          player2_stake_play_cents: split.playDebited,
          player2_stake_winnings_cents: split.winningsDebited,
          status: DuelStatus.active,
          started_at: new Date(),
        },
      });
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Not enough credits", code: "INSUFFICIENT_CREDITS", shortfallCents: err.shortfallCents },
        { status: 402 }
      );
    }
    if (err instanceof JoinError) {
      const messages: Record<JoinFailure["code"], string> = {
        NOT_FOUND: "Duel not found",
        NOT_PAID: "This is not a paid duel",
        NOT_PENDING: "This challenge is no longer open",
        SELF_JOIN: "You cannot join your own challenge",
        ALREADY_TAKEN: "Someone else already joined this challenge",
      };
      return NextResponse.json(
        { error: messages[err.failure.code], code: err.failure.code },
        { status: err.failure.status }
      );
    }
    console.error("[POST /api/duel/paid/[id]/join]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
