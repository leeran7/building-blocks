/**
 * POST /api/friends — Send a friend request to another user.
 * GET  /api/friends — List accepted friends for the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { ensureUser } from "../../../src/db/user";
import { sendFriendRequest, getFriends } from "../../../src/db/friendship";
import { createNotification } from "../../../src/db/notification";
import { prisma } from "../../../src/db/client";
import { climberDisplay } from "../../../src/lib/handle";

export const runtime = "nodejs";

interface SendBody {
  receiverId?: unknown;
}

export async function POST(request: NextRequest) {
  let uid: string;
  let userEmail: string | undefined;
  let emailVerified: boolean | undefined;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
    userEmail = decoded.email;
    emailVerified = decoded.email_verified;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (userEmail) {
    await ensureUser({ id: uid, email: userEmail, emailVerified: emailVerified ?? false }).catch(() => {});
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const receiverId = typeof body.receiverId === "string" ? body.receiverId.trim() : null;
  if (!receiverId) {
    return NextResponse.json(
      { error: "receiverId is required", code: "MISSING_FIELD", field: "receiverId" },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit({
    namespace: "friends:send",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await sendFriendRequest(uid, receiverId);

    if (!result.ok) {
      switch (result.code) {
        case "self":
          return NextResponse.json(
            { error: "You cannot send a friend request to yourself", code: "SELF_REQUEST" },
            { status: 400 }
          );
        case "already_friends":
          return NextResponse.json(
            { error: "You are already friends with this user", code: "ALREADY_FRIENDS" },
            { status: 409 }
          );
        case "already_pending":
          return NextResponse.json(
            { error: "A pending request already exists", code: "ALREADY_PENDING" },
            { status: 409 }
          );
        case "blocked":
          return NextResponse.json(
            { error: "Cannot send friend request", code: "BLOCKED" },
            { status: 403 }
          );
        case "not_found":
          return NextResponse.json(
            { error: "User not found", code: "NOT_FOUND" },
            { status: 404 }
          );
      }
    }

    // Look up sender name for the notification
    const sender = await prisma.user.findUnique({
      where: { id: uid },
      select: { display_name: true, avatar_id: true },
    });
    const senderName = climberDisplay(uid, sender?.display_name, sender?.avatar_id);

    await createNotification({
      userId: receiverId,
      type: "friend_request",
      title: `${senderName} sent you a friend request`,
      body: "Accept to add them as a friend.",
      data: { friendshipId: result.friendship.id, senderId: uid, senderName },
    }).catch((err) => {
      console.error("[POST /api/friends] notification error:", err);
    });

    return NextResponse.json(
      {
        id: result.friendship.id,
        senderId: result.friendship.sender_id,
        receiverId: result.friendship.receiver_id,
        status: result.friendship.status,
        createdAt: result.friendship.created_at.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/friends] DB error:", err);
    return NextResponse.json(
      { error: "Could not send friend request. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

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
    namespace: "friends:list",
    identifier: uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const friends = await getFriends(uid);
    return NextResponse.json({ friends });
  } catch (err) {
    console.error("[GET /api/friends] DB error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
