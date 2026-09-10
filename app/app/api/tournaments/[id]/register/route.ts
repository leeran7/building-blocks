import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { assertPaidDuelAllowed } from "../../../../../src/lib/paidDuelGeo";
import { registerForTournament } from "../../../../../src/db/tournaments";

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
    namespace: "tournament:register",
    identifier: uid,
    max: 20,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  const result = await registerForTournament(id, uid);

  switch (result.outcome) {
    case "registered":
      return NextResponse.json({ ok: true }, { status: 201 });
    case "duplicate":
      return NextResponse.json({ error: "Already registered", code: "DUPLICATE" }, { status: 409 });
    case "full":
      return NextResponse.json({ error: "Tournament is full", code: "FULL" }, { status: 409 });
    case "closed":
      return NextResponse.json({ error: "Registration closed", code: "CLOSED" }, { status: 403 });
  }
}
