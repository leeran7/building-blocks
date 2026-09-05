/**
 * GET /api/tower
 *
 * Cross-stack snapshot for OG metadata and any caller that still hits the
 * unscoped path. Burial is computed against each block's own season — never
 * a leftover "tech" ground. This GET does not create seasons.
 *
 * CRITICAL:
 * - Sorted by altitude descending only (spend_c never used as sort key — AC-17)
 * - buried and amber_edge derived at API layer, not stored
 * - rank = 1-based array position
 * - Cache-Control: s-maxage=3, stale-while-revalidate
 */

import { NextRequest, NextResponse } from "next/server";
import { getRankedBlocks } from "../../../src/db/blocks";
import { getAllActiveSeasons } from "../../../src/db/seasons";
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
    const [blocks, seasons] = await Promise.all([
      getRankedBlocks(),
      getAllActiveSeasons(),
    ]);
    return buildResponse(blocks, seasons);
  } catch (error) {
    console.error("[GET /api/tower]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function buildResponse(
  blocks: Awaited<ReturnType<typeof getRankedBlocks>>,
  seasons: Awaited<ReturnType<typeof getAllActiveSeasons>>
): Promise<NextResponse> {
  const viewsFor = (category: string | null): number => {
    if (!category) return 0;
    return seasons.get(category)?.views_k ?? 0;
  };

  const top = blocks[0];
  const topV = viewsFor(top?.category ?? null);
  const growth = computeGrowth(topV);
  const rate = computeRate(topV);
  const ground = computeGround(topV);

  const enrichedBlocks = blocks.map((block, index) => {
    const V = viewsFor(block.category);
    return {
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
      platform: block.platform,
      handle: block.handle,
      buried: isBuried(block.altitude, V),
      amber_edge: isAmberEdge(block.altitude, V),
      rank: index + 1,
    };
  });

  const rank1 = enrichedBlocks[0];
  const cost_of_rank1_usd = rank1
    ? priceTo(rank1.altitude, 0, topV)
    : 5.0;

  const topSeason = top?.category ? seasons.get(top.category) : undefined;
  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + 90);

  const body = {
    season: {
      id: topSeason?.id ?? "none",
      views_k: topV,
      starts_at: (topSeason?.starts_at ?? now).toISOString(),
      ends_at: (topSeason?.ends_at ?? ends).toISOString(),
      is_active: topSeason?.is_active ?? false,
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
