import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../src/config/tournaments";
import { getTournament, getTournamentBracket } from "../../../../src/db/tournaments";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Tournaments coming soon — remove this early return to enable
  return NextResponse.json({ error: "Tournaments are coming soon", code: "COMING_SOON" }, { status: 503 });

  if (!TOURNAMENTS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bracket = await getTournamentBracket(id);

  return NextResponse.json({ tournament, bracket });
}
