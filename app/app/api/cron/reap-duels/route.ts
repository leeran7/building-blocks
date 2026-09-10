/**
 * GET /api/cron/reap-duels — sweep abandoned paid duels and refund stakes.
 *
 * Handles the case a paid PENDING challenge was created (creator staked) but no
 * opponent ever joined: after a grace window it is voided and the stake returned
 * to its source buckets. Idempotent via the per-duel `refunded` guard.
 *
 * Auth: Vercel Cron's `Authorization: Bearer <CRON_SECRET>`, or a manual trigger
 * with `x-internal-token: <INTERNAL_TOKEN>`. Compared constant-time (trust.md rule 3).
 */

import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../../../../src/api/middleware/requireAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { reapStalePendingPaidDuels } from "../../../../src/db/duel";

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
    namespace: "cron:reap-duels",
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
    const refunded = await reapStalePendingPaidDuels();
    return NextResponse.json({ ok: true, refunded });
  } catch (err) {
    console.error("[cron/reap-duels]", err);
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }
}
