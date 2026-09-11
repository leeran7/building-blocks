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
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { claimDailyChips, DailyGrantAlreadyClaimedError } from "../../../../../src/db/chips";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    throw err;
  }
}
