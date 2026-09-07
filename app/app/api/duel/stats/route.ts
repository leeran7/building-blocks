/**
 * GET /api/duel/stats — Authenticated user's personal duel stats.
 *
 * Returns the signed-in user's win/loss/streak record, or null if they
 * have never played a ranked duel.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { getDuelStats } from "../../../../src/db/duel";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Auth: required
  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const stats = await getDuelStats(uid);
  return NextResponse.json(stats ?? null);
}
