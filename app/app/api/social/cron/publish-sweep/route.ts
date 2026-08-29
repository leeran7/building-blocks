/**
 * POST /api/social/cron/publish-sweep (§4.10). Machine auth only — Vercel
 * Cron sends Authorization: Bearer ${CRON_SECRET}, which must equal
 * ADMIN_TOKEN (ADR-11).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSocialCron } from "../../../../../src/api/middleware/requireSocialAdmin";
import { runPublishSweep } from "../../../../../src/social/agent/jobRunner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSocialCron(request);
  if (authError) return authError;

  try {
    const summary = await runPublishSweep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[POST /api/social/cron/publish-sweep]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
