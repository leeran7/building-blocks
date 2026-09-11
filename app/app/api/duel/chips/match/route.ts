/**
 * POST /api/duel/chips/match — Find or create a chip duel at a given tier.
 *
 * If an open chip room exists at the requested tier, join it. Otherwise
 * create one and wait. Same matchmaker pattern as the paid arena but with
 * chip settlement (zero-sum, non-cashable).
 */

import { NextRequest, NextResponse } from "next/server";
import { PAID_DUELS_ENABLED } from "../../../../../src/config/paidDuel";
import { withAuth } from "../../../../../src/lib/api/withAuth";
import { assertPaidDuelAllowed } from "../../../../../src/lib/paidDuelGeo";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { newRunSeed } from "../../../../../src/game/rng";
import { CATEGORY_BY_SLUG } from "../../../../../src/lib/categories";
import {
  isValidChipTier,
  findOpenChipDuels,
  createChipRoom,
  joinChipDuel,
  InsufficientChipsError,
} from "../../../../../src/db/chips";

export const runtime = "nodejs";

interface Body {
  stakeCents?: unknown;
  categorySlug?: unknown;
}

export const POST = withAuth(async (request: NextRequest, uid: string) => {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Geoblock every chip stake, not just the purchase — a user who bought
  // chips from an allowed region must not be able to spend them from a
  // blocked one. Logged for the compliance audit trail.
  const geo = assertPaidDuelAllowed(request);
  console.log(
    JSON.stringify({
      type: "chip_stake_geo_check",
      uid,
      allowed: geo.allowed,
      country: geo.country,
      region: geo.region,
      reason: geo.reason,
      timestamp: new Date().toISOString(),
    })
  );
  if (!geo.allowed) {
    return NextResponse.json(
      { error: "Chip duels aren't available in your region", code: "GEO_BLOCKED", reason: geo.reason },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit({
    namespace: "chip:match",
    identifier: uid,
    max: 20,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const stakeCents = typeof body.stakeCents === "number" ? body.stakeCents : 0;
  if (!isValidChipTier(stakeCents)) {
    return NextResponse.json({ error: "Invalid chip tier" }, { status: 400 });
  }

  const categorySlug =
    typeof body.categorySlug === "string" && Object.hasOwn(CATEGORY_BY_SLUG, body.categorySlug)
      ? body.categorySlug
      : "random";

  try {
    const open = await findOpenChipDuels({ stakeCents, excludeUserId: uid, limit: 1 });

    if (open.length > 0) {
      const result = await joinChipDuel(open[0].id, uid);
      if (result.ok) {
        return NextResponse.json({ matched: true, duelId: open[0].id });
      }
    }

    const duelId = await createChipRoom(uid, stakeCents, categorySlug, newRunSeed());
    return NextResponse.json({ matched: false, duelId, waiting: true }, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return NextResponse.json(
        { error: "Not enough chips", code: "INSUFFICIENT_CHIPS", shortfall: err.shortfallCents },
        { status: 402 }
      );
    }
    console.error("[POST /api/duel/chips/match]", err);
    return NextResponse.json(
      { error: "Could not find or create a chip match. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
});
