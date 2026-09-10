/**
 * POST /api/duel/paid/match — find OR create a paid match at a stake tier.
 * GET  /api/duel/paid/match — poll: matched / waiting / idle for the caller.
 *
 * The public per-tier queue. A pending paid duel (stake set, no player2) is a
 * queue slot, so "find a match" is: grab the oldest open room at this tier that
 * isn't yours and doesn't share your IP, join it (atomic stake + flip active);
 * if none, open your own room and wait. No separate escrow — joining is the same
 * SELECT FOR UPDATE that starts any paid match, so the stake can never exist
 * without its escrow row.
 *
 * Trust: stake is server-authoritative (tier only, no client cents); auth, geo,
 * 18+ and the kill switch are enforced by guardPaidDuelRequest.
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { checkRateLimit, clientIp } from "../../../../../src/lib/rateLimit";
import { guardPaidDuelRequest } from "../../../../../src/lib/paidDuelGuards";
import { recordAgeConfirmation } from "../../../../../src/db/user";
import { newRunSeed } from "../../../../../src/game/rng";
import { InsufficientCreditsError } from "../../../../../src/db/credits";
import {
  findOpenPaidDuels,
  joinPaidDuel,
  createPaidRoom,
  getOpenPaidDuelForUser,
  getActiveDuelForUser,
} from "../../../../../src/db/duel";
import { isValidStakeCents } from "../../../../../src/config/paidDuel";
import {
  hashIp,
  filterSameIpCandidates,
  rememberRoomCreatorIp,
} from "../../../../../src/lib/paidDuelCollusion";

export const runtime = "nodejs";

const RATE_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;
const POLL_RATE_MAX = 900;
const DEFAULT_CATEGORY = "tech";
/** How many oldest rooms to consider before opening our own (collusion + race skips). */
const CANDIDATE_SCAN = 10;

const BodySchema = z.object({
  stakeUsd: z.number().positive(),
  ageConfirmed: z.literal(true),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: "duel:paid:match",
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
  // Stake is server-authoritative — reject any client-supplied cents.
  if (typeof body === "object" && body !== null && "stake_cents" in body) {
    return NextResponse.json(
      { error: "Client-supplied stake_cents is forbidden", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A stake tier and 18+ confirmation are required", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const stakeCents = Math.round(parsed.data.stakeUsd * 100);
  if (!isValidStakeCents(stakeCents)) {
    return NextResponse.json({ error: "Invalid stake amount", code: "INVALID_STAKE" }, { status: 400 });
  }

  await recordAgeConfirmation(uid);

  // Already waiting in a room? Return it rather than opening a second (one open
  // paid room per user). The client surfaces the actual tier.
  const mine = await getOpenPaidDuelForUser(uid);
  if (mine) {
    return NextResponse.json({ status: "waiting", duelId: mine.id, stakeCents: mine.stakeCents });
  }

  const ipHash = hashIp(clientIp(request));

  // Try to join an opponent's open room at this tier, oldest first, skipping
  // same-IP creators. joinPaidDuel is atomic, so a lost race just moves on.
  const candidates = await findOpenPaidDuels({
    stakeCents,
    excludeUserId: uid,
    limit: CANDIDATE_SCAN,
  });
  const eligible = await filterSameIpCandidates(candidates, ipHash);

  for (const c of eligible) {
    try {
      const outcome = await joinPaidDuel(c.id, uid);
      if (outcome.ok) {
        return NextResponse.json({ status: "matched", duelId: c.id, stakeCents });
      }
      // NOT_PENDING / ALREADY_TAKEN etc. — someone grabbed it first; try next.
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          { error: "Not enough credits", code: "INSUFFICIENT_CREDITS", shortfallCents: err.shortfallCents },
          { status: 402 }
        );
      }
      console.error("[POST /api/duel/paid/match] join attempt failed:", err);
      // Unexpected on this candidate — try the next rather than failing the whole match.
    }
  }

  // No joinable opponent — open our own room and wait.
  const id = nanoid(8);
  const seed = newRunSeed();
  try {
    await createPaidRoom(uid, stakeCents, DEFAULT_CATEGORY, id, seed);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Not enough credits", code: "INSUFFICIENT_CREDITS", shortfallCents: err.shortfallCents },
        { status: 402 }
      );
    }
    console.error("[POST /api/duel/paid/match] createPaidRoom failed:", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }

  await rememberRoomCreatorIp(id, ipHash);
  return NextResponse.json({ status: "waiting", duelId: id, stakeCents });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: "duel:paid:match:poll",
    identifier: uid,
    max: POLL_RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  // Matched? Our waiting room was joined by someone (it flips to active with us
  // as a participant), or we joined one.
  const active = await getActiveDuelForUser(uid);
  if (active && active.stake_cents != null) {
    return NextResponse.json({ status: "matched", duelId: active.id });
  }

  const mine = await getOpenPaidDuelForUser(uid);
  if (mine) {
    return NextResponse.json({ status: "waiting", duelId: mine.id, stakeCents: mine.stakeCents });
  }

  return NextResponse.json({ status: "idle" });
}
