import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../src/config/tournaments";
import { listTournaments } from "../../../src/db/tournaments";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Tournaments coming soon — remove this early return to enable
  return NextResponse.json({ error: "Tournaments are coming soon", code: "COMING_SOON" }, { status: 503 });

  if (!TOURNAMENTS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;

  const tournaments = await listTournaments({ categorySlug: category });
  return NextResponse.json({ tournaments });
}
