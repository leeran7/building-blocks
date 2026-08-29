/**
 * POST /api/admin/season-rollover
 *
 * Manual season rollover for one stack. Admin-auth required.
 * Body: { category: string } — a season slug (74-stack or leftover legacy).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/api/middleware/requireAdmin";
import { rolloverSeason } from "../../../../src/db/seasons";
import { parseSeasonSlug } from "../../../../src/game/categories";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => null)) as
      | { category?: unknown }
      | null;
    const category = parseSeasonSlug(
      typeof body?.category === "string" ? body.category : null
    );
    if (!category) {
      return NextResponse.json(
        { error: "category required", code: "INVALID_CATEGORY" },
        { status: 400 }
      );
    }

    const newSeason = await rolloverSeason(category);

    console.log(
      JSON.stringify({
        type: "admin_action",
        action: "season_rollover",
        category,
        new_season_id: newSeason.id,
        starts_at: newSeason.starts_at.toISOString(),
        ends_at: newSeason.ends_at.toISOString(),
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      season_id: newSeason.id,
      category,
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
