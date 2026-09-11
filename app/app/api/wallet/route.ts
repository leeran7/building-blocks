import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../src/lib/api/withAuth";
import { getWallet } from "../../../src/db/credits";
import { PAID_DUELS_ENABLED } from "../../../src/config/paidDuel";

export const runtime = "nodejs";

export const GET = withAuth(async (_request: NextRequest, uid: string) => {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const wallet = await getWallet(uid);
    return NextResponse.json(wallet);
  } catch (err) {
    console.error("[GET /api/wallet]", err);
    return NextResponse.json(
      { error: "Could not load your wallet. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
});
