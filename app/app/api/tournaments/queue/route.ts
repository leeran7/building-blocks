// @ts-nocheck — tournaments disabled; remove with the early return when enabling
import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { queueForTournament, getQueueStatus } from "../../../../src/db/tournaments";
import { isValidChipTier } from "../../../../src/db/chips";
import { newRunSeed } from "../../../../src/game/rng";

export const runtime = "nodejs";

function comingSoon() {
  return NextResponse.json({ error: "Tournaments are coming soon", code: "COMING_SOON" }, { status: 503 });
}

export async function GET() {
  // Tournaments coming soon — remove this early return to enable
  return comingSoon();

  if (!TOURNAMENTS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const queues = await getQueueStatus();
  return NextResponse.json({ queues });
}

export async function POST(request: NextRequest) {
  // Tournaments coming soon — remove this early return to enable
  return comingSoon();

  if (!TOURNAMENTS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "tournament:queue",
    identifier: uid,
    max: 20,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { entryFeeCents?: unknown };
  try {
    body = (await request.json()) as { entryFeeCents?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entryFeeCents =
    typeof body.entryFeeCents === "number" ? body.entryFeeCents : 0;
  if (!isValidChipTier(entryFeeCents)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const result = await queueForTournament(uid, entryFeeCents, newRunSeed);

  switch (result.outcome) {
    case "queued":
      return NextResponse.json(
        {
          status: "queued",
          tournamentId: result.tournamentId,
          entrantCount: result.entrantCount,
          bracketSize: result.bracketSize,
        },
        { status: 201 }
      );
    case "started":
      return NextResponse.json({
        status: "started",
        tournamentId: result.tournamentId,
      });
    case "duplicate":
      return NextResponse.json(
        { error: "Already queued", tournamentId: result.tournamentId },
        { status: 409 }
      );
    case "insufficient_chips":
      return NextResponse.json(
        {
          error: "Not enough chips",
          code: "INSUFFICIENT_CHIPS",
          shortfall: result.shortfall,
        },
        { status: 402 }
      );
  }
}
