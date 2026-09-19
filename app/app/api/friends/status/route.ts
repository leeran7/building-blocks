/**
 * GET /api/friends/status?userId=... — Check friendship status with a user.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { prisma } from "../../../../src/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { uid } = await requireAuth(request);
    const rl = await checkRateLimit({
      namespace: "friends:status",
      identifier: uid,
      max: 120,
      windowSeconds: 60,
      failMode: "open",
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required", code: "missing_user_id" }, { status: 400 });
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { sender_id: uid, receiver_id: userId },
          { sender_id: userId, receiver_id: uid },
        ],
        status: { in: ["pending", "accepted"] },
      },
      select: { status: true },
    });

    return NextResponse.json({ status: friendship?.status ?? "none" });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
