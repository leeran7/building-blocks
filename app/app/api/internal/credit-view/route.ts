/**
 * POST /api/internal/credit-view
 *
 * Internal route called by edge middleware to run the view-counting pipeline.
 * This is NOT accessible from the browser — internal only.
 *
 * Using an internal API route allows us to use Prisma (Node.js) + Redis
 * without hitting the edge runtime constraint on Prisma.
 *
 * CRITICAL: View counting is server-side only (AC-9).
 */

import { NextRequest, NextResponse } from "next/server";
import { runViewPipeline } from "../../../../src/views/pipeline";
import { incrementSeasonViews } from "../../../../src/db/seasons";
import { incrementViewsServed } from "../../../../src/db/blocks";
import { computeGround } from "../../../../src/engine/index";
import { getRedis } from "../../../../src/lib/redis";
import { getRankedBlocks } from "../../../../src/db/blocks";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Fail closed if INTERNAL_TOKEN is not configured
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
    // ip, sessionId, and ua must come from the signed edge payload — not trusted as-is
    // for anti-abuse, but pipeline's Redis dedup/cap keys still use them.
    // The token + server-origin call is the primary abuse barrier.
    const { sessionId, ip, ua, ts } = body;

    if (!sessionId || !ip) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Reject requests older than 10 seconds — prevents replay attacks
    if (!ts || typeof ts !== "number" || Date.now() - ts > 10_000) {
      return NextResponse.json({ error: "Request expired" }, { status: 400 });
    }

    const redis = getRedis();

    // DB accessor for view credit
    const db = {
      updateSeasonViews: () => incrementSeasonViews(),
    };

    const result = await runViewPipeline({ sessionId, ip, ua }, { redis, db });

    // If view was credited, update views_served for above-ground blocks (AC-15)
    if (result.credited && result.views_k_new !== null) {
      const ground = computeGround(result.views_k_new);
      try {
        // Get top blocks and update views_served for above-ground ones
        const blocks = await getRankedBlocks();
        const aboveGround = blocks.filter((b) => b.altitude >= ground);

        // Update views_served for blocks above ground (best-effort)
        // This is a secondary write — failure doesn't roll back the global view credit
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
