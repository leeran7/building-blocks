/**
 * GET /api/geo/ranked — lightweight geo-eligibility probe for ranked features.
 *
 * Returns { allowed, reason } so the client can show the ranked option as
 * blocked (with messaging) in markets that can't use it, instead of hiding it
 * entirely. No auth required — it only reads Vercel's edge geo headers.
 *
 * This is now a REVALIDATION path only: `/duel` and `/duel/chips` resolve the
 * same decision server-side at request time via `resolveRankedEligibility`, so
 * the first paint is already correct. Both sides call the identical helper —
 * do not re-derive the decision here.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveRankedEligibility } from "../../../../src/lib/rankedEligibility";

export const runtime = "edge";

export function GET(request: NextRequest) {
  return NextResponse.json(resolveRankedEligibility(request.headers));
}
