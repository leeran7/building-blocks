import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { assertPaidDuelAllowed } from "../../../../../src/lib/paidDuelGeo";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { getTournament } from "../../../../../src/db/tournaments";
import { createEntryFeeCheckout } from "../../../../../src/api/stripeConnect";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const geo = assertPaidDuelAllowed(request);
  if (!geo.allowed) {
    return NextResponse.json(
      { error: "Not available in your region", code: "GEO_BLOCKED", reason: geo.reason },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit({
    namespace: "tournament:checkout",
    identifier: uid,
    max: 10,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (tournament.status !== "REGISTRATION") {
    return NextResponse.json({ error: "Registration closed", code: "CLOSED" }, { status: 403 });
  }
  if (tournament.entrantCount >= tournament.bracketSize) {
    return NextResponse.json({ error: "Tournament is full", code: "FULL" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const url = await createEntryFeeCheckout({
    userId: uid,
    tournamentId: id,
    tournamentName: tournament.name,
    entryFeeCents: tournament.entryFeeCents,
    successUrl: `${origin}/tournaments/${id}?registered=true`,
    cancelUrl: `${origin}/tournaments/${id}`,
  });

  return NextResponse.json({ url });
}
