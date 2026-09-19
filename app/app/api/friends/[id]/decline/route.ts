/**
 * POST /api/friends/[id]/decline — Decline a pending friend request.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { declineFriendRequest } from "../../../../../src/db/friendship";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "friends:decline",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await declineFriendRequest(id, uid);

    if (!result.ok) {
      switch (result.code) {
        case "not_found":
          return NextResponse.json({ error: "Friend request not found", code: "NOT_FOUND" }, { status: 404 });
        case "not_receiver":
          return NextResponse.json({ error: "Not your request to decline", code: "FORBIDDEN" }, { status: 403 });
        case "not_pending":
          return NextResponse.json({ error: "Request is no longer pending", code: "NOT_PENDING" }, { status: 409 });
      }
    }

    return NextResponse.json({ declined: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/friends/decline] error:", err);
    return NextResponse.json(
      { error: "Could not decline friend request. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
