/**
 * GET /api/notifications/count — Unread notification count.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { getUnreadCount } from "../../../../src/db/notification";

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

  try {
    const count = await getUnreadCount(uid);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[GET /api/notifications/count] error:", err);
    return NextResponse.json({ error: "Internal error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
