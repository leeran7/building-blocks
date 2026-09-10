import { NextRequest, NextResponse } from "next/server";
import { TOURNAMENTS_ENABLED } from "../../../../src/config/tournaments";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { getUserPrizeEntries } from "../../../../src/db/tournaments";
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

  const [prizes, user] = await Promise.all([
    getUserPrizeEntries(uid),
    prisma.user.findUniqueOrThrow({ where: { id: uid }, select: { stripe_connect_account_id: true } }),
  ]);

  const payoutReady = user.stripe_connect_account_id
    ? await isPayoutReady(user.stripe_connect_account_id)
    : false;

  return NextResponse.json({
    prizes,
    connected: !!user.stripe_connect_account_id,
    payoutReady,
  });
}
