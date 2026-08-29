/**
 * GET /api/climb/billboards
 *
 * Paid blocks that hang in the free climb at the altitude they bought.
 * Cosmetic only — the climb sim never reads this. Cached; degrades to [] on
 * DB failure so a season outage never blocks play.
 */

import { NextResponse } from "next/server";
import { getClimbBillboardCandidates } from "../../../../src/db/blocks";
import { getAllActiveSeasons } from "../../../../src/db/seasons";
import { isBuried } from "../../../../src/engine/index";
import { visibleBillboards, type Billboard } from "../../../../src/game/billboards";

export const runtime = "nodejs";

const SIGN_LIMIT = 48;

export async function GET(): Promise<NextResponse> {
  try {
    const [candidates, seasons] = await Promise.all([
      getClimbBillboardCandidates(80),
      getAllActiveSeasons(),
    ]);

    const aboveGround: Billboard[] = [];
    for (const row of candidates) {
      const V = seasons.get(row.category)?.views_k ?? 0;
      if (isBuried(row.altitude, V)) continue;
      aboveGround.push({
        slug: row.slug,
        display_name: row.display_name,
        url: row.url,
        altitude: row.altitude,
        category: row.category,
      });
      if (aboveGround.length >= SIGN_LIMIT) break;
    }

    return NextResponse.json(
      { signs: visibleBillboards(aboveGround) },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate" } }
    );
  } catch (error) {
    console.error("[GET /api/climb/billboards]", error);
    return NextResponse.json(
      { signs: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
