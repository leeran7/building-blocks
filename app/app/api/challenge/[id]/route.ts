/**
 * GET /api/challenge/[id] — Get a single challenge by id.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { getChallenge } from "../../../../src/db/challenge";

export const runtime = "nodejs";

export async function GET(
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

  const c = await getChallenge(id);
  if (!c) {
    return NextResponse.json({ error: "Challenge not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (c.sender_id !== uid && c.recipient_id !== uid) {
    return NextResponse.json({ error: "Not your challenge", code: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({
    id: c.id,
    senderId: c.sender_id,
    recipientId: c.recipient_id,
    categorySlug: c.category_slug,
    status: c.status,
    duelId: c.duel_id,
    expiresAt: c.expires_at.toISOString(),
    createdAt: c.created_at.toISOString(),
    sender: { id: c.sender.id, displayName: c.sender.display_name, username: c.sender.username },
    recipient: { id: c.recipient.id, displayName: c.recipient.display_name, username: c.recipient.username },
    direction: c.sender_id === uid ? "sent" : "received",
  });
}
