import { NextRequest, NextResponse } from "next/server";
import { requireSocialCron } from "../../../../../src/api/middleware/requireSocialAdmin";
import { runWeeklyStrategyJob } from "../../../../../src/social/agent/jobRunner";
import { previousIsoWeek, currentIsoWeek } from "../../../../../src/social/isoWeek";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSocialCron(request);
  if (authError) return authError;

  try {
    // Cron runs Monday morning — analyze the ISO week that just completed.
    const isoWeek = previousIsoWeek(currentIsoWeek());
    const result = await runWeeklyStrategyJob(isoWeek, "system:cron:weekly-strategy");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/social/cron/weekly-strategy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
