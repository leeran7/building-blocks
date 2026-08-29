/**
 * POST /api/internal/credit-view
 *
 * Internal route called by edge middleware to run the view-counting pipeline.
 * This is NOT accessible from the browser — internal only.
 *
 * Views are attributed to a paid stack — never the leftover "tech" season
 * unless a leftover block actually lives there. Homepage visits do not
 * credit any stack. The climb never credits views.
 *
 * CRITICAL: View counting is server-side only (AC-9).
 */

import { NextRequest, NextResponse } from "next/server";
import { runViewPipeline } from "../../../../src/views/pipeline";
import { getActiveSeason, incrementSeasonViews } from "../../../../src/db/seasons";
import { getBlockBySlug, incrementViewsServed, getRankedBlocks } from "../../../../src/db/blocks";
import { computeGround } from "../../../../src/engine/index";
import { getRedis } from "../../../../src/lib/redis";
import { parsePaidStackSlug, parseSeasonSlug } from "../../../../src/game/categories";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedToken = process.env.INTERNAL_TOKEN;
  if (!expectedToken) {
    console.error("[credit-view] INTERNAL_TOKEN not set — rejecting all requests");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const internalToken = request.headers.get("x-internal-token");
  if (!internalToken || internalToken !== expectedToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sessionId, ip, ua, ts } = body;

    if (!sessionId || !ip) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!ts || typeof ts !== "number" || Date.now() - ts > 10_000) {
      return NextResponse.json({ error: "Request expired" }, { status: 400 });
    }

    const category = await resolveCreditCategory(body.category, body.blockSlug);
    if (!category) {
      return NextResponse.json({
        raw: 0,
        qualified: 0,
        credited: 0,
        views_k_new: null,
        skipped: true,
      });
    }

    // A page view must not open a season. If a stack has no active season
    // there is nothing to credit the view to — incrementSeasonViews would
    // throw anyway — so skip, exactly as for an unresolvable category.
    if (!(await getActiveSeason(category))) {
      return NextResponse.json({
        raw: 0,
        qualified: 0,
        credited: 0,
        views_k_new: null,
        skipped: true,
      });
    }

    const redis = getRedis();

    const db = {
      updateSeasonViews: () => incrementSeasonViews(category),
    };

    const result = await runViewPipeline(
      { sessionId, ip, ua, category },
      { redis, db }
    );

    if (result.credited && result.views_k_new !== null) {
      const ground = computeGround(result.views_k_new);
      try {
        const blocks = await getRankedBlocks(category);
        const aboveGround = blocks.filter((b) => b.altitude >= ground);
        for (const block of aboveGround) {
          await incrementViewsServed(block.id, ground).catch(() => {});
        }
      } catch {
        // Non-critical — don't fail view credit for views_served failure
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/internal/credit-view]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function resolveCreditCategory(
  rawCategory: unknown,
  blockSlug: unknown
): Promise<string | null> {
  if (typeof blockSlug === "string" && blockSlug.length > 0) {
    const block = await getBlockBySlug(blockSlug);
    return parseSeasonSlug(block?.category);
  }
  if (typeof rawCategory === "string") {
    return parsePaidStackSlug(rawCategory);
  }
  return null;
}
