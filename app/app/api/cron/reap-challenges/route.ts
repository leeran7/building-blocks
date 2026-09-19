/**
 * GET /api/cron/reap-challenges — Expire stale pending challenges.
 *
 * Auth: Vercel Cron's CRON_SECRET or INTERNAL_TOKEN (constant-time).
 */

import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../../../../src/api/middleware/requireAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { reapExpiredChallenges } from "../../../../src/db/challenge";
import { createNotification } from "../../../../src/db/notification";

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
    namespace: "cron:reap-challenges",
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
    const { count: expired, challenges } = await reapExpiredChallenges();

    for (const c of challenges) {
      const recipientName = c.recipient.display_name ?? "your opponent";
      createNotification({
        userId: c.sender_id,
        type: "challenge_expired",
        title: "Challenge expired",
        body: `Your challenge to ${recipientName} expired`,
        data: { challengeId: c.id },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    console.error("[cron/reap-challenges]", err);
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }
}
