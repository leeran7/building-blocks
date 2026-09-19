/**
 * GET  /api/notifications — Paginated notification feed.
 * POST /api/notifications — Mark notifications as read.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../src/lib/rateLimit";
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
} from "../../../src/db/notification";

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
    namespace: "notifications:list",
    identifier: uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const take = Math.min(Number(searchParams.get("take")) || 20, 50);

  try {
    const notifications = await getNotifications(uid, take, cursor);
    return NextResponse.json({
      items: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        read: n.read,
        createdAt: n.created_at.toISOString(),
      })),
      nextCursor: notifications.length === take ? notifications[notifications.length - 1]?.id : null,
    });
  } catch (err) {
    console.error("[GET /api/notifications] error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

interface MarkReadBody {
  ids?: unknown;
  all?: unknown;
}

export async function POST(request: NextRequest) {
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "notifications:read",
    identifier: uid,
    max: 120,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  let body: MarkReadBody;
  try {
    body = (await request.json()) as MarkReadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    if (body.all === true) {
      const count = await markAllNotificationsRead(uid);
      return NextResponse.json({ marked: count });
    }

    if (Array.isArray(body.ids) && body.ids.every((id) => typeof id === "string")) {
      const ids = body.ids as string[];
      if (ids.length === 0 || ids.length > 100) {
        return NextResponse.json(
          { error: "ids must contain 1-100 entries", code: "BAD_REQUEST" },
          { status: 400 }
        );
      }
      const count = await markNotificationsRead(uid, ids);
      return NextResponse.json({ marked: count });
    }

    return NextResponse.json(
      { error: "Provide ids (string[]) or all: true", code: "BAD_REQUEST" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[POST /api/notifications] error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
