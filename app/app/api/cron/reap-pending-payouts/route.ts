/**
 * GET /api/cron/reap-pending-payouts — attempt disbursement for winners
 * awaiting a tournament prize transfer.
 *
 * assignPrizes() marks entries `pending_onboarding` once a tournament
 * completes, but a winner may take time to finish Stripe Connect Express
 * onboarding. This sweep retries disbursePrize() for every prize-bearing
 * entry without a transfer yet; it's a no-op (outcome: "not_payout_ready")
 * until the winner completes onboarding, at which point the next sweep
 * disburses. Idempotent via TournamentEntry.stripe_transfer_id.
 */

import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../../../../src/api/middleware/requireAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { getPendingPayoutEntries, disbursePrize } from "../../../../src/db/tournaments";
import { createPrizeTransfer, isPayoutReady } from "../../../../src/api/stripeConnect";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = request.headers.get("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (constantTimeEqual(token, cronSecret)) return true;
  }
  const internalToken = process.env.INTERNAL_TOKEN;
  if (internalToken) {
    const header = request.headers.get("x-internal-token") ?? "";
    if (constantTimeEqual(header, internalToken)) return true;
  }
  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);
  const rl = await checkRateLimit({
    namespace: "cron:reap-pending-payouts",
    identifier: ip,
    max: 30,
    windowSeconds: 600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const pending = await getPendingPayoutEntries();
    let transferred = 0;
    let notReady = 0;
    let failed = 0;

    for (const entry of pending) {
      try {
        const result = await disbursePrize(
          entry.tournamentId,
          entry.userId,
          createPrizeTransfer,
          isPayoutReady
        );
        if (result.outcome === "transferred") transferred++;
        else if (result.outcome === "not_payout_ready" || result.outcome === "no_connect_account") notReady++;
      } catch (err) {
        failed++;
        console.error("[cron/reap-pending-payouts] disburse failed", {
          tournamentId: entry.tournamentId,
          userId: entry.userId,
          err,
        });
      }
    }

    return NextResponse.json({ ok: true, checked: pending.length, transferred, notReady, failed });
  } catch (err) {
    console.error("[cron/reap-pending-payouts]", err);
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }
}
