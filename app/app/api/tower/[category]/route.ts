/**
 * GET /api/tower/[category]
 *
 * Per-category leaderboard. Same shape as GET /api/tower but scoped to a
 * single category and includes the category ground level.
 *
 * Path param:
 *   category — must be a valid Category enum value (Tech | Design | Business |
 *              Creative | Gaming | Science)
 *
 * Response:
 *   {
 *     category: string,
 *     season: { id, views_k, starts_at, ends_at, is_active },
 *     engine: { growth, rate, ground },
 *     blocks: [ { id, slug, url, display_name, altitude, spend_c, views_served,
 *                 clicks, peak_rank, hidden_at, created_at, buried, amber_edge,
 *                 rank } ],
 *     cost_of_rank1_usd: number
 *   }
 *
 * Cache-Control: s-maxage=3, stale-while-revalidate
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../src/db/client";
import { getActiveSeason } from "../../../../src/db/seasons";
import { isGameCategory } from "../../../../src/game/categories";
import {
  computeGrowth,
  computeRate,
  computeGround,
  isBuried,
  isAmberEdge,
  priceTo,
} from "../../../../src/engine/index";

export const runtime = "nodejs";

const LEADERBOARD_LIMIT = 100;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string }> }
): Promise<NextResponse> {
  const { category: categoryParam } = await params;
  // Category is a free-form slug now — every subcategory has its own tower. Only
  // guard the slug shape (a-z, 0-9, dashes) to keep it well-formed.
  const category = categoryParam.toLowerCase();

  // Only subcategories get towers (broad/legacy slugs are not valid).
  if (!isGameCategory(category)) {
    return NextResponse.json(
      { error: "Unknown category", code: "INVALID_CATEGORY", field: "category" },
      { status: 404 }
    );
  }

  try {
    // Read-only: this is an unauthenticated GET on a free-form slug, so
    // creating here mints one season row per slug anyone happens to request.
    // A category with no season has accrued no views, which is the same V a
    // freshly created one would carry, so the response is unchanged.
    const season = await getActiveSeason(category);
    const V = season?.views_k ?? 0;

    const growth = computeGrowth(V);
    const rate = computeRate(V);
    const ground = computeGround(V);

    // Fetch category-scoped visible blocks, altitude DESC, capped at 100
    // CRITICAL: sorted by altitude descending — not spend_c (AC-17)
    const blocks = await prisma.block.findMany({
      where: {
        category,
        hidden_at: null,
      },
      orderBy: { altitude: "desc" },
      take: LEADERBOARD_LIMIT,
      select: {
        id: true,
        slug: true,
        url: true,
        display_name: true,
        altitude: true,
        spend_c: true,
        views_served: true,
        clicks: true,
        peak_rank: true,
        hidden_at: true,
        created_at: true,
        platform: true,
        handle: true,
      },
    });

    // Derive rank, buried, amber_edge at API layer (not stored — ADR-1)
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
      platform: block.platform,
      handle: block.handle,
      buried: isBuried(block.altitude, V),
      amber_edge: isAmberEdge(block.altitude, V),
      rank: index + 1, // 1-based within this category
    }));

    const rank1 = enrichedBlocks[0];
    const cost_of_rank1_usd = rank1
      ? priceTo(rank1.altitude, 0, V)
      : 5.0; // MIN_ENTRY_USD if no blocks in category

    const body = {
      category,
      // null when no season has started for this stack yet. The first
      // checkout creates it; a read must not.
      season: season
        ? {
            id: season.id,
            views_k: season.views_k,
            starts_at: season.starts_at.toISOString(),
            ends_at: season.ends_at.toISOString(),
            is_active: season.is_active,
          }
        : null,
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
  } catch (error) {
    console.error(`[GET /api/tower/${category}]`, error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
