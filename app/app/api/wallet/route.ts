/**
 * GET /api/wallet — the signed-in user's credit balances + recent ledger.
 *
 * Returns both buckets: play (purchased, non-cashable) and winnings (won,
 * cashable). Never exposes another user's wallet.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { getWallet } from "../../../src/db/credits";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const wallet = await getWallet(uid);
  return NextResponse.json(wallet);
}
