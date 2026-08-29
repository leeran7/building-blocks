import { NextRequest, NextResponse } from "next/server";
import { requireSocialCron } from "../../../../../src/api/middleware/requireSocialAdmin";
import { runTokenRefreshSweep } from "../../../../../src/social/agent/jobRunner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSocialCron(request);
  if (authError) return authError;

  try {
    const summary = await runTokenRefreshSweep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[POST /api/social/cron/token-refresh-sweep]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
