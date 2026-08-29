/**
 * GET /api/climb/billboards
 *
 * Paid blocks that hang in the free climb at the altitude they bought.
 * Cosmetic only — the climb sim never reads this. Cached; degrades to [] on
 * DB failure so a season outage never blocks play.
 */

import { NextRequest, NextResponse } from "next/server";
import { getClimbBillboardCandidates } from "../../../../src/db/blocks";
import { getAllActiveSeasons } from "../../../../src/db/seasons";
import { isBuried } from "../../../../src/engine/index";
import { visibleBillboards, type Billboard } from "../../../../src/game/billboards";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";

export const runtime = "nodejs";

const SIGN_LIMIT = 48;
/** Top paid listings per stack, before burial. */
const PER_STACK_CANDIDATES = 8;
const BILLBOARD_RATE_MAX = 60;
const BILLBOARD_RATE_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rl = await checkRateLimit({
    namespace: "climb-billboards",
    identifier: `ip:${clientIp(request)}`,
    max: BILLBOARD_RATE_MAX,
    windowSeconds: BILLBOARD_RATE_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  try {
    const [candidates, seasons] = await Promise.all([
      getClimbBillboardCandidates(PER_STACK_CANDIDATES),
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
      {
        headers: {
          "Cache-Control": "s-maxage=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/climb/billboards]", error);
    return NextResponse.json(
      { signs: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
