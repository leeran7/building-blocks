/**
 * GET /api/tower
 *
 * Primary read path. Returns ranked block list and current engine state.
 *
 * CRITICAL:
 * - Sorted by altitude descending only (spend_c never used as sort key — AC-17)
 * - buried and amber_edge derived at API layer, not stored
 * - rank = 1-based array position
 * - Cache-Control: s-maxage=3, stale-while-revalidate
 */

import { NextRequest, NextResponse } from "next/server";
import { getRankedBlocks } from "../../../src/db/blocks";
import { getOrCreateActiveSeason } from "../../../src/db/seasons";
import {
  computeGrowth,
  computeRate,
  computeGround,
  isBuried,
  isAmberEdge,
  priceTo,
} from "../../../src/engine/index";

export const runtime = "nodejs";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // Get active season (creates one if none exists)
    const season = await getOrCreateActiveSeason();

    // Season rollover is intentionally NOT performed here.
    // An unauthenticated, cacheable GET must not trigger writes (race + abuse risk).
    // Rollover is triggered via POST /api/admin/season-rollover (authenticated).
    return buildResponse(season);
  } catch (error) {
    console.error("[GET /api/tower]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function buildResponse(season: {
  id: string;
  views_k: number;
  starts_at: Date;
  ends_at: Date;
  is_active: boolean;
}): Promise<NextResponse> {
  const V = season.views_k;

  // Engine state at current V
  const growth = computeGrowth(V);
  const rate = computeRate(V);
  const ground = computeGround(V);

  // Ranked blocks — ORDER BY altitude DESC, hidden_at IS NULL
  // CRITICAL: spend_c is never a sort key
  const blocks = await getRankedBlocks();

  // Derive rank, buried, amber_edge at API layer (not stored)
  const enrichedBlocks = blocks.map((block, index) => ({
    id: block.id,
    slug: block.slug,
    url: block.url,
    display_name: block.display_name,
    altitude: block.altitude,
    spend_c: block.spend_c,
    views_served: block.views_served,
    clicks: block.clicks,
    peak_rank: block.peak_rank,
    hidden_at: block.hidden_at?.toISOString() ?? null,
    created_at: block.created_at.toISOString(),
    // Derived fields — computed here, not stored (ADR-1)
    buried: isBuried(block.altitude, V),
    amber_edge: isAmberEdge(block.altitude, V),
    rank: index + 1, // 1-based
  }));

  // Cost of rank #1 for a new buyer (myAlt = 0)
  const rank1 = enrichedBlocks[0];
  const cost_of_rank1_usd = rank1
    ? priceTo(rank1.altitude, 0, V)
    : 5.0; // MIN_ENTRY_USD if no blocks

  const body = {
    season: {
      id: season.id,
      views_k: season.views_k,
      starts_at: season.starts_at.toISOString(),
      ends_at: season.ends_at.toISOString(),
      is_active: season.is_active,
    },
    engine: {
      growth,
      rate,
      ground,
    },
    blocks: enrichedBlocks,
    cost_of_rank1_usd,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "s-maxage=3, stale-while-revalidate",
    },
  });
}
