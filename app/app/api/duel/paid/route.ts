/**
 * POST /api/duel/paid — create a paid 1v1 challenge by staking credits.
 *
 * No Stripe at duel time: the creator's stake is debited from their credit
 * wallet (play-credits first, then winnings) atomically with the Duel row
 * creation, so a debit can never exist without its escrow row and a player can
 * never overspend. The seed is generated server-side and withheld (R-5).
 *
 * Trust: stake_cents is set server-side from the chosen tier; the client may
 * never supply cents (mirrors the /api/checkout no-client-value guard).
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { guardPaidDuelRequest } from "../../../../src/lib/paidDuelGuards";
import { hashIp, rememberRoomCreatorIp } from "../../../../src/lib/paidDuelCollusion";
import { recordAgeConfirmation } from "../../../../src/db/user";
import { newRunSeed } from "../../../../src/game/rng";
import { CATEGORY_BY_SLUG } from "../../../../src/lib/categories";
import { prisma } from "../../../../src/db/client";
import {
  createPaidRoom,
  DuplicateOpenPaidRoomError,
  getActivePaidDuelForUser,
} from "../../../../src/db/duel";
import { InsufficientCreditsError } from "../../../../src/db/credits";
import { isValidStakeCents } from "../../../../src/config/paidDuel";
import { DuelStatus } from "@prisma/client";

export const runtime = "nodejs";

const RATE_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;

const BodySchema = z.object({
  categorySlug: z.string().min(1),
  stakeUsd: z.number().positive(),
  ageConfirmed: z.literal(true),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: "duel:paid:create",
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

  // The stake is server-authoritative — reject any client-supplied cents.
  if (typeof body === "object" && body !== null && "stake_cents" in body) {
    return NextResponse.json(
      { error: "Client-supplied stake_cents is forbidden", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "categorySlug, a stake tier, and 18+ confirmation are required", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const categorySlug = parsed.data.categorySlug.toLowerCase().trim();
  if (!Object.hasOwn(CATEGORY_BY_SLUG, categorySlug)) {
    return NextResponse.json({ error: "Unknown category", code: "INVALID_CATEGORY" }, { status: 400 });
  }

  const stakeCents = Math.round(parsed.data.stakeUsd * 100);
  if (!isValidStakeCents(stakeCents)) {
    return NextResponse.json(
      { error: "Invalid stake amount", code: "INVALID_STAKE" },
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

  // One open paid pending challenge per user. This is a fast-path check for
  // the common case; createPaidRoom's DB constraint is the race-proof backstop
  // (see DuplicateOpenPaidRoomError below) for two concurrent creates.
  const existing = await prisma.duel.findFirst({
    where: { player1_id: uid, status: DuelStatus.pending, stake_cents: { not: null } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You have an open paid challenge", code: "DUEL_ALREADY_PENDING", existingId: existing.id },
      { status: 409 }
    );
  }

  const id = nanoid(8);
  const seed = newRunSeed();

  try {
    await createPaidRoom(uid, stakeCents, categorySlug, id, seed);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "Not enough credits",
          code: "INSUFFICIENT_CREDITS",
          shortfallCents: err.shortfallCents,
        },
        { status: 402 }
      );
    }
    if (err instanceof DuplicateOpenPaidRoomError) {
      return NextResponse.json(
        { error: "You have an open paid challenge", code: "DUEL_ALREADY_PENDING", existingId: err.existingId },
        { status: 409 }
      );
    }
    console.error("[POST /api/duel/paid]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }

  // These rooms are publicly joinable via the per-tier queue, so guard them the
  // same way the matchmaker guards its own rooms: remember the creator IP hash.
  await rememberRoomCreatorIp(id, hashIp(clientIp(request)));

  return NextResponse.json({ duelId: id }, { status: 201 });
}
