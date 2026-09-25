/**
 * POST /api/challenge — Send an in-app challenge to a specific user.
 * GET  /api/challenge — List my pending challenges (sent + received).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import { CATEGORY_BY_SLUG } from "../../../src/lib/categories";
import { ensureUser } from "../../../src/db/user";
import {
  createChallenge,
  getPendingChallengesForUser,
} from "../../../src/db/challenge";
import { publicUserJson } from "../../../src/db/publicUser";
import { createNotification } from "../../../src/db/notification";
import { climberDisplay } from "../../../src/lib/handle";

export const runtime = "nodejs";

const CREATE_RATE_MAX = 20;
const CREATE_RATE_WINDOW = 3600;

interface CreateBody {
  recipientId?: unknown;
  categorySlug?: unknown;
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

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : null;
  if (!recipientId) {
    return NextResponse.json(
      { error: "recipientId is required", code: "MISSING_FIELD", field: "recipientId" },
      { status: 400 }
    );
  }

  const categorySlug =
    typeof body.categorySlug === "string" ? body.categorySlug.toLowerCase().trim() : "tech";
  if (!Object.hasOwn(CATEGORY_BY_SLUG, categorySlug)) {
    return NextResponse.json(
      { error: "Unknown category", code: "INVALID_CATEGORY", field: "categorySlug" },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit({
    namespace: "challenge:create",
    identifier: uid,
    max: CREATE_RATE_MAX,
    windowSeconds: CREATE_RATE_WINDOW,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await createChallenge(uid, recipientId, categorySlug);

    switch (result.outcome) {
      case "self_challenge":
        return NextResponse.json(
          { error: "You cannot challenge yourself", code: "SELF_CHALLENGE" },
          { status: 400 }
        );
      case "recipient_not_found":
        return NextResponse.json(
          { error: "User not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      case "too_many_pending":
        return NextResponse.json(
          { error: "You have too many open challenges", code: "TOO_MANY_PENDING" },
          { status: 409 }
        );
      case "duplicate":
        return NextResponse.json(
          { error: "You already have a pending challenge with this user", code: "DUPLICATE" },
          { status: 409 }
        );
      case "created": {
        const c = result.challenge;
        const senderName = climberDisplay(c.sender_id, c.sender.display_name, c.sender.avatar_id);

        await createNotification({
          userId: recipientId,
          type: "challenge_received",
          title: "New challenge",
          body: `${senderName} challenged you to a 1v1 duel!`,
          data: {
            challengeId: c.id,
            senderId: c.sender_id,
            senderName,
            categorySlug: c.category_slug,
          },
        }).catch((err) => {
          console.error("[POST /api/challenge] notification error:", err);
        });

        return NextResponse.json(
          {
            id: c.id,
            senderId: c.sender_id,
            recipientId: c.recipient_id,
            categorySlug: c.category_slug,
            status: c.status,
            expiresAt: c.expires_at.toISOString(),
            sender: publicUserJson(c.sender),
            recipient: publicUserJson(c.recipient),
          },
          { status: 201 }
        );
      }
    }
  } catch (err) {
    console.error("[POST /api/challenge] DB error:", err);
    return NextResponse.json(
      { error: "Could not create challenge. Please try again.", code: "INTERNAL_ERROR" },
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

  try {
    const challenges = await getPendingChallengesForUser(uid);
    return NextResponse.json(
      challenges.map((c) => ({
        id: c.id,
        senderId: c.sender_id,
        recipientId: c.recipient_id,
        categorySlug: c.category_slug,
        status: c.status,
        expiresAt: c.expires_at.toISOString(),
        createdAt: c.created_at.toISOString(),
        sender: publicUserJson(c.sender),
        recipient: publicUserJson(c.recipient),
        direction: c.sender_id === uid ? "sent" : "received",
      }))
    );
  } catch (err) {
    console.error("[GET /api/challenge] DB error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
