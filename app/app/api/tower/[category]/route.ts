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
import { Category } from "@prisma/client";
import { prisma } from "../../../../src/db/client";
import { getOrCreateActiveSeason } from "../../../../src/db/seasons";
import {
  computeGrowth,
  computeRate,
  computeGround,
  isBuried,
  isAmberEdge,
  priceTo,
} from "../../../../src/engine/index";

export const runtime = "nodejs";

// Map lowercase URL slugs → Prisma enum values
const SLUG_TO_CATEGORY = new Map<string, Category>([
  ["tech", Category.Tech],
  ["design", Category.Design],
  ["business", Category.Business],
  ["creative", Category.Creative],
  ["gaming", Category.Gaming],
  ["science", Category.Science],
]);

const LEADERBOARD_LIMIT = 100;

export async function GET(
  _request: NextRequest,
  { params }: { params: { category: string } }
): Promise<NextResponse> {
  // Normalize: URL slugs are lowercase, enum values are PascalCase
  const category = SLUG_TO_CATEGORY.get(params.category.toLowerCase());

  if (!category) {
    return NextResponse.json(
      {
        error: `Invalid category. Must be one of: ${Array.from(SLUG_TO_CATEGORY.keys()).join(", ")}`,
        code: "INVALID_CATEGORY",
        field: "category",
      },
      { status: 404 }
    );
  }

  try {
    const season = await getOrCreateActiveSeason(category);
    const V = season.views_k;

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
  } catch (error) {
    console.error(`[GET /api/tower/${category}]`, error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
