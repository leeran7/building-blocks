/**
 * DELETE /api/friends/[id] — Remove a friend (either party can remove).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { removeFriend } from "../../../../src/db/friendship";

export const runtime = "nodejs";

export async function DELETE(
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
    namespace: "friends:remove",
    identifier: uid,
    max: 30,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await removeFriend(id, uid);

    if (!result.ok) {
      switch (result.code) {
        case "not_found":
          return NextResponse.json({ error: "Friendship not found", code: "NOT_FOUND" }, { status: 404 });
        case "not_party":
          return NextResponse.json({ error: "Not your friendship to remove", code: "FORBIDDEN" }, { status: 403 });
      }
    }

    return NextResponse.json({ removed: true }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/friends] error:", err);
    return NextResponse.json(
      { error: "Could not remove friend. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
