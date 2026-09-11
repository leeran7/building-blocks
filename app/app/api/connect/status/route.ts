import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { isPayoutReady } from "../../../../src/api/stripeConnect";
import { prisma } from "../../../../src/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: uid },
      select: { stripe_connect_account_id: true },
    });

    if (!user.stripe_connect_account_id) {
      return NextResponse.json({ connected: false, payoutReady: false });
    }

    const payoutReady = await isPayoutReady(user.stripe_connect_account_id);
    return NextResponse.json({ connected: true, payoutReady });
  } catch (err) {
    console.error("[GET /api/connect/status]", err);
    return NextResponse.json(
      { error: "Could not check payout status. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
