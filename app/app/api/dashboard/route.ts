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
 *   4+. one category leaderboard query per unique category the user owns
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
import { getUserFreeClimbRecord, getUserClimbReplays } from "../../../src/db/climb";
import {
  computeGround,
  isBuried,
  isAmberEdge,
  priceTo,
  estimateDaysUntilBuried,
} from "../../../src/engine/index";

export const runtime = "nodejs";

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

    // Missing season → V=0 (season-start ground). Never fall back to the
    // legacy "tech" ghost stack — that season is not one of the 74.

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
      const [freeClimb, replays] = await Promise.all([
        getUserFreeClimbRecord(decoded.uid).catch(() => null),
        getUserClimbReplays(decoded.uid).catch(() => []),
      ]);
      return NextResponse.json({
        user: { id: decoded.uid, email: decoded.email ?? "" },
        blocks: [],
        freeClimb,
        replays,
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

    // Queries 4+: one per unique category in the user's blocks.
    const userCategories = Array.from(
      new Set(userBlocks.map((b) => b.category).filter((c): c is string => !!c))
    );

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
      const cat = block.category;
      const season = cat ? seasonMap.get(cat) : undefined;
      const V = season?.views_k ?? 0;
      const ground = computeGround(V);

      const catBlocks = cat ? categoryBlocksMap.get(cat) ?? [] : [];
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

    const [freeClimb, replays] = await Promise.all([
      getUserFreeClimbRecord(decoded.uid).catch(() => null),
      getUserClimbReplays(decoded.uid).catch(() => []),
    ]);

    return NextResponse.json({
      user: { id: decoded.uid, email: decoded.email ?? "" },
      blocks: enrichedBlocks,
      freeClimb,
      replays,
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
