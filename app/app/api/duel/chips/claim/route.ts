/**
 * POST /api/duel/chips/claim — claim the daily free chip grant.
 *
 * Compliance requirement, not a promo: a one-time signup grant alone isn't a
 * genuine free-play alternative to purchase (Kater v. Churchill Downs, 886
 * F.3d 784 (9th Cir. 2018)). This gives every player an ongoing, no-purchase
 * way to keep playing indefinitely — one grant per rolling 24h window.
 */

import { NextRequest, NextResponse } from "next/server";
import { PAID_DUELS_ENABLED } from "../../../../../src/config/paidDuel";
import { withAuth } from "../../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { claimDailyChips, DailyGrantAlreadyClaimedError } from "../../../../../src/db/chips";

export const runtime = "nodejs";

export const POST = withAuth(async (_request: NextRequest, uid: string) => {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = await checkRateLimit({
    namespace: "chip:claim",
    identifier: uid,
    max: 10,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { balanceAfter } = await claimDailyChips(uid);
    return NextResponse.json({ claimed: true, balanceAfter });
  } catch (err) {
    if (err instanceof DailyGrantAlreadyClaimedError) {
      return NextResponse.json(
        {
          error: "Already claimed today",
          code: "ALREADY_CLAIMED",
          nextClaimAt: err.nextClaimAt.toISOString(),
        },
        { status: 429 }
      );
    }
    console.error("[POST /api/duel/chips/claim]", err);
    return NextResponse.json(
      { error: "Could not claim your daily chips. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
});
