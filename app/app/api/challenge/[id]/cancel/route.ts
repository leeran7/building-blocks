/**
 * POST /api/challenge/[id]/cancel — Cancel a challenge you sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { cancelChallenge } from "../../../../../src/db/challenge";

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
    namespace: "challenge:cancel",
    identifier: uid,
    max: 60,
    windowSeconds: 3600,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    const result = await cancelChallenge(id, uid);

    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Challenge not found", code: "NOT_FOUND" }, { status: 404 });
      case "not_sender":
        return NextResponse.json({ error: "Not your challenge to cancel", code: "FORBIDDEN" }, { status: 403 });
      case "not_pending":
        return NextResponse.json({ error: "Challenge is no longer pending", code: "NOT_PENDING" }, { status: 409 });
      case "cancelled":
        return NextResponse.json({ cancelled: true }, { status: 200 });
    }
  } catch (err) {
    console.error("[POST /api/challenge/cancel] error:", err);
    return NextResponse.json(
      { error: "Could not cancel challenge. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
