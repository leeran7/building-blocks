/**
 * GET /api/cron/reap-tournament-rounds — sweep stale tournament matches.
 *
 * For each in-progress tournament, find active duels in the current round that
 * have been running past the grace window. Void them as abandoned (forfeit to
 * opponent if one player submitted, no-winner if neither did). Then try to
 * advance the round — if all matches are now resolved, the next round's duels
 * are created (or the tournament completes).
 */

import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../../../../src/api/middleware/requireAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { reapDuelIfStale } from "../../../../src/db/duel";
import { advanceRound, assignPrizes } from "../../../../src/db/tournaments";
import { newRunSeed } from "../../../../src/game/rng";
import { prisma } from "../../../../src/db/client";
import { TournamentStatus, DuelStatus } from "@prisma/client";

export const runtime = "nodejs";

const ROUND_STALE_GRACE_MS = 15 * 60_000;

function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = request.headers.get("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (constantTimeEqual(token, cronSecret)) return true;
  }
  const internalToken = process.env.INTERNAL_TOKEN;
  if (internalToken) {
    const header = request.headers.get("x-internal-token") ?? "";
    if (constantTimeEqual(header, internalToken)) return true;
  }
  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);
  const rl = await checkRateLimit({
    namespace: "cron:reap-tournament-rounds",
    identifier: ip,
    max: 30,
    windowSeconds: 600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tournaments = await prisma.tournament.findMany({
      where: { status: TournamentStatus.IN_PROGRESS },
      select: { id: true, current_round: true },
    });

    let reaped = 0;
    let advanced = 0;

    for (const t of tournaments) {
      const staleDuels = await prisma.duel.findMany({
        where: {
          tournament_id: t.id,
          tournament_round: t.current_round,
          status: DuelStatus.active,
        },
        select: { id: true },
      });

      for (const d of staleDuels) {
        const didReap = await reapDuelIfStale(d.id, ROUND_STALE_GRACE_MS);
        if (didReap) reaped++;
      }

      const result = await advanceRound(t.id, newRunSeed);
      if (result.outcome === "advanced" || result.outcome === "tournament_complete") {
        advanced++;
      }
      if (result.outcome === "tournament_complete") {
        await assignPrizes(t.id);
      }
    }

    return NextResponse.json({ ok: true, tournaments: tournaments.length, reaped, advanced });
  } catch (err) {
    console.error("[cron/reap-tournament-rounds]", err);
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }
}
