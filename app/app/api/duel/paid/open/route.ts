/**
 * GET /api/duel/paid/open?stake=<cents> — the joinable paid lobby.
 *
 * Oldest-first open (pending, unjoined) paid challenges, optionally filtered to
 * a stake tier, excluding the caller's own rooms. Read-only discovery: joining
 * still goes through POST /api/duel/paid/[id]/join (atomic stake + start).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { guardPaidDuelRequest } from "../../../../../src/lib/paidDuelGuards";
import { findOpenPaidDuels } from "../../../../../src/db/duel";
import { isValidStakeCents } from "../../../../../src/config/paidDuel";

export const runtime = "nodejs";

const POLL_RATE_MAX = 900;
const RATE_WINDOW_SECONDS = 3600;
const LIST_LIMIT = 20;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: "duel:paid:open",
    identifier: uid,
    max: POLL_RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const stakeParam = request.nextUrl.searchParams.get("stake");
  let stakeCents: number | undefined;
  if (stakeParam != null) {
    const n = Number(stakeParam);
    if (!Number.isInteger(n) || !isValidStakeCents(n)) {
      return NextResponse.json({ error: "Invalid stake tier", code: "INVALID_STAKE" }, { status: 400 });
    }
    stakeCents = n;
  }

  const rooms = await findOpenPaidDuels({ stakeCents, excludeUserId: uid, limit: LIST_LIMIT });

  const now = Date.now();
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      stakeCents: r.stakeCents,
      creatorName: r.creatorName,
      ageSeconds: Math.max(0, Math.round((now - r.createdAt.getTime()) / 1000)),
    })),
  });
}
