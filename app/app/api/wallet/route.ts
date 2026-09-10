import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { getWallet } from "../../../src/db/credits";
import { PAID_DUELS_ENABLED } from "../../../src/config/paidDuel";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!PAID_DUELS_ENABLED) {
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

  const wallet = await getWallet(uid);
  return NextResponse.json(wallet);
}
