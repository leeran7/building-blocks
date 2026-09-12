/**
 * GET /api/geo/ranked — lightweight geo-eligibility probe for ranked features.
 *
 * Returns { allowed } so the client can show the ranked option as blocked
 * (with messaging) in markets that can't use it, instead of hiding it
 * entirely. No auth required — it only reads Vercel's edge geo headers.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertPaidDuelAllowed } from "../../../../src/lib/paidDuelGeo";
import { PAID_DUELS_ENABLED } from "../../../../src/config/paidDuel";

export const runtime = "edge";

export function GET(request: NextRequest) {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ allowed: false, reason: "disabled" });
  }

  const geo = assertPaidDuelAllowed(request);
  return NextResponse.json({
    allowed: geo.allowed,
    reason: geo.reason ?? null,
  });
}
