import { NextRequest, NextResponse } from "next/server";
import { PAID_DUELS_ENABLED } from "../../../../../src/config/paidDuel";
import { findOpenChipDuels } from "../../../../../src/db/chips";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const tier = url.searchParams.get("tier");
  const stakeCents = tier ? parseInt(tier, 10) : undefined;

  const duels = await findOpenChipDuels({
    stakeCents: stakeCents && !isNaN(stakeCents) ? stakeCents : undefined,
  });

  return NextResponse.json({
    duels: duels.map((d) => ({
      id: d.id,
      stakeCents: d.stakeCents,
      createdAt: d.createdAt.toISOString(),
      creatorName: d.creatorName,
    })),
  });
}
