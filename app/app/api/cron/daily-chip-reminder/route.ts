import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "../../../../src/api/middleware/requireAdmin";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { prisma } from "../../../../src/db/client";
import { sendPushToUser } from "../../../../src/lib/pushNotify";
import { DAILY_GRANT_COOLDOWN_MS } from "../../../../src/db/chips";

export const runtime = "nodejs";

const BATCH_SIZE = 500;
const CRON_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

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
    namespace: "cron:daily-chip-reminder",
    identifier: ip,
    max: 10,
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
    const now = new Date();
    const cooldownThreshold = new Date(now.getTime() - DAILY_GRANT_COOLDOWN_MS);
    const recentWindow = new Date(cooldownThreshold.getTime() - CRON_INTERVAL_MS);

    const eligible = await prisma.user.findMany({
      where: {
        pushTokens: { some: {} },
        OR: [
          { last_daily_chips_claim_at: null },
          {
            last_daily_chips_claim_at: {
              lt: cooldownThreshold,
              gte: recentWindow,
            },
          },
        ],
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    const results = await Promise.allSettled(
      eligible.map((user) =>
        sendPushToUser(user.id, {
          title: "Free chips!",
          body: "Your daily free chips are ready to claim!",
          data: { type: "daily_chips" },
        })
      )
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[cron/daily-chip-reminder]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
