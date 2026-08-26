/**
 * GET /api/dashboard
 *
 * Returns all blocks owned by the authenticated user, enriched with:
 *   - rank: 1-based position within the block's category leaderboard
 *   - rank_above_altitude: altitude of the block ranked immediately above (null if #1)
 *   - competitor_cost_usd: USD cost to overtake the block above (null if #1)
 *   - burial_risk_days: estimated days until ground level reaches the block's altitude
 *   - payments: all payments made for this block (for AltitudeChart)
 *   - season: the active season for this block's category
 *
 * DB query budget: max 9
 *   1. getAllActiveSeasons (1 query, all categories)
 *   2. user's blocks (1 query)
 *   3. payments for user's blocks (1 query, bulk)
 *   4-9. one category leaderboard query per unique category (max 6)
 *
 * Request:
 *   Authorization: Bearer <firebase-id-token>
 *
 * Response 200:
 *   { user: { id, email }, blocks: EnrichedBlock[] }
 *
 * Error responses: { error: string, code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "../../../src/lib/requireAuth";
import { prisma } from "../../../src/db/client";
import { getAllActiveSeasons } from "../../../src/db/seasons";
import {
  computeGround,
  isBuried,
  isAmberEdge,
  priceTo,
} from "../../../src/engine/index";
import { DEFAULT_CONSTANTS } from "../../../src/engine/constants";

export const runtime = "nodejs";

const VIEWS_K_PER_DAY_ESTIMATE = 1.0;

function estimateDaysUntilBuried(altitude: number, V: number): number | null {
  const ground = computeGround(V);
  if (altitude <= ground) return 0;

  const { G0, DOUBLE_EVERY_K, MAX_GROWTH } = DEFAULT_CONSTANTS;
  if (altitude <= G0) return 0;

  // AC-23: altitude above maximum possible ground → will never be buried this season
  if (altitude > G0 * MAX_GROWTH) return null;

  const lambda = Math.log(2) / DOUBLE_EVERY_K;
  const dV = (1 / lambda) * Math.log(altitude / G0) - V;
  if (dV <= 0) return 0;

  // AC-21: floor (not round) — conservative estimate
  return Math.floor(dV / VIEWS_K_PER_DAY_ESTIMATE);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  let decoded;
  try {
    decoded = await requireAuth(request);
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json(
      { error: "Authentication failed", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    // Query 1: all active seasons (one per category)
    const seasonMap = await getAllActiveSeasons();

    // Fallback season for blocks with null category or missing season
    const techSeason = seasonMap.get("tech");
    const fallbackV = techSeason?.views_k ?? 0;

    // Query 2: user's blocks
    const userBlocks = await prisma.block.findMany({
      where: { userId: decoded.uid },
      orderBy: { altitude: "desc" },
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
        category: true,
        season_id: true,
      },
    });

    if (userBlocks.length === 0) {
      return NextResponse.json({
        user: { id: decoded.uid, email: decoded.email ?? "" },
        blocks: [],
      });
    }

    // Query 3: all payments for user's blocks (bulk)
    const blockIds = userBlocks.map((b) => b.id);
    const allPayments = await prisma.payment.findMany({
      where: { block_id: { in: blockIds } },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        block_id: true,
        amount_cents: true,
        metres_added: true,
        created_at: true,
      },
    });
    const paymentsByBlock = new Map<string, typeof allPayments>();
    for (const p of allPayments) {
      const list = paymentsByBlock.get(p.block_id) ?? [];
      list.push(p);
      paymentsByBlock.set(p.block_id, list);
    }

    // Queries 4–9: one per unique category in user's blocks (max 6)
    const userCategories = Array.from(
      new Set(userBlocks.map((b) => b.category ?? "tech"))
    ) as string[];

    const categoryBlocksMap = new Map<
      string,
      Array<{ id: string; slug: string; display_name: string; altitude: number; userId: string | null }>
    >();

    await Promise.all(
      userCategories.map(async (cat) => {
        const catBlocks = await prisma.block.findMany({
          where: { category: cat, hidden_at: null },
          orderBy: { altitude: "desc" },
          take: 500,
          select: { id: true, slug: true, display_name: true, altitude: true, userId: true },
        });
        categoryBlocksMap.set(cat, catBlocks);
      })
    );

    // Enrich each user block
    const enrichedBlocks = userBlocks.map((block) => {
      const cat = block.category ?? "tech";
      const season = seasonMap.get(cat);
      const V = season?.views_k ?? fallbackV;
      const ground = computeGround(V);

      const catBlocks = categoryBlocksMap.get(cat) ?? [];
      const myIndex = catBlocks.findIndex((b) => b.id === block.id);
      const rank = myIndex >= 0 ? myIndex + 1 : null;

      const blockAbove = myIndex > 0 ? catBlocks[myIndex - 1] : null;
      const rank_above_altitude = blockAbove?.altitude ?? null;
      const competitor_cost_usd =
        rank_above_altitude !== null && rank !== null && rank > 1
          ? priceTo(rank_above_altitude, block.altitude, V)
          : null;

      const payments = (paymentsByBlock.get(block.id) ?? []).map((p) => ({
        id: p.id,
        amount_cents: p.amount_cents,
        metres_added: p.metres_added,
        created_at: p.created_at.toISOString(),
      }));

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
        category: block.category,
        season_id: block.season_id,
        rank,
        rank_above_altitude,
        competitor_cost_usd,
        buried: isBuried(block.altitude, V),
        amber_edge: isAmberEdge(block.altitude, V),
        ground,
        burial_risk_days: estimateDaysUntilBuried(block.altitude, V),
        season: season
          ? {
              id: season.id,
              views_k: season.views_k,
              category: season.category,
            }
          : null,
        payments,
      };
    });

    console.log(
      JSON.stringify({
        type: "dashboard_request",
        method: "GET",
        path: "/api/dashboard",
        status: 200,
        uid: decoded.uid,
        block_count: userBlocks.length,
        duration_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      user: { id: decoded.uid, email: decoded.email ?? "" },
      blocks: enrichedBlocks,
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
