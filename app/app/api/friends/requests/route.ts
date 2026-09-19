/**
 * GET /api/friends/requests — List incoming and outgoing friend requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { getPendingRequests, getOutgoingRequests } from "../../../../src/db/friendship";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "friends:requests",
    identifier: uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const [incoming, outgoing] = await Promise.all([
      getPendingRequests(uid),
      getOutgoingRequests(uid),
    ]);

    return NextResponse.json({
      incoming: incoming.map((r) => ({
        id: r.id,
        sender: r.sender,
        createdAt: r.createdAt.toISOString(),
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        receiver: r.receiver,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[GET /api/friends/requests] DB error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
