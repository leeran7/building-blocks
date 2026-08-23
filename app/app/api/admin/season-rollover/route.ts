/**
 * POST /api/admin/season-rollover
 *
 * Manual season rollover. Admin-auth required.
 * Also triggered automatically by GET /api/tower when ends_at is past.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/api/middleware/requireAdmin";
import { rolloverSeason } from "../../../../src/db/seasons";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const newSeason = await rolloverSeason();

    console.log(
      JSON.stringify({
        type: "admin_action",
        action: "season_rollover",
        new_season_id: newSeason.id,
        starts_at: newSeason.starts_at.toISOString(),
        ends_at: newSeason.ends_at.toISOString(),
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      season_id: newSeason.id,
      starts_at: newSeason.starts_at.toISOString(),
      ends_at: newSeason.ends_at.toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/admin/season-rollover]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
