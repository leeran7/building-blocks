/**
 * POST /api/friends/[id]/accept — Accept a pending friend request.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { acceptFriendRequest } from "../../../../../src/db/friendship";
import { createNotification } from "../../../../../src/db/notification";
import { prisma } from "../../../../../src/db/client";
import { climberDisplay } from "../../../../../src/lib/handle";

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
    namespace: "friends:accept",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await acceptFriendRequest(id, uid);

    if (!result.ok) {
      switch (result.code) {
        case "not_found":
          return NextResponse.json({ error: "Friend request not found", code: "NOT_FOUND" }, { status: 404 });
        case "not_receiver":
          return NextResponse.json({ error: "Not your request to accept", code: "FORBIDDEN" }, { status: 403 });
        case "not_pending":
          return NextResponse.json({ error: "Request is no longer pending", code: "NOT_PENDING" }, { status: 409 });
      }
    }

    // Look up friendship to notify the sender
    const friendship = await prisma.friendship.findUnique({
      where: { id },
      select: { sender_id: true },
    });

    if (friendship) {
      const accepter = await prisma.user.findUnique({
        where: { id: uid },
        select: { display_name: true, avatar_id: true },
      });
      const accepterName = climberDisplay(uid, accepter?.display_name, accepter?.avatar_id);

      await createNotification({
        userId: friendship.sender_id,
        type: "friend_accepted",
        title: `${accepterName} accepted your friend request`,
        body: "You are now friends!",
        data: { friendshipId: id, accepterId: uid, accepterName },
      }).catch((err) => {
        console.error("[POST /api/friends/accept] notification error:", err);
      });
    }

    return NextResponse.json({ accepted: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/friends/accept] error:", err);
    return NextResponse.json(
      { error: "Could not accept friend request. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
