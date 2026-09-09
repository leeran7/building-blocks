/**
 * Shared preamble for paid-duel money endpoints: kill switch → geoblock → auth
 * → user-row provisioning. Keeps the compliance and trust checks identical and
 * in one place across /api/credits/checkout, /api/duel/paid, and the join route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "./requireAuth";
import { assertPaidDuelAllowed } from "./paidDuelGeo";
import { PAID_DUELS_ENABLED } from "../config/paidDuel";
import { ensureUser } from "../db/user";

export type PaidDuelGuardResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; response: NextResponse };

export async function guardPaidDuelRequest(
  request: NextRequest
): Promise<PaidDuelGuardResult> {
  // Kill switch — feature ships dark until explicitly enabled.
  if (!PAID_DUELS_ENABLED) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Paid duels are not available", code: "DISABLED" },
        { status: 404 }
      ),
    };
  }

  // Geoblock (fail-closed in prod when the region signal is missing).
  const geo = assertPaidDuelAllowed(request);
  if (!geo.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Paid duels aren't available in your region", code: "GEO_BLOCKED" },
        { status: 451 }
      ),
    };
  }

  // Auth — no guests in paid duels (staking/payout needs a persistent account).
  let uid: string;
  let email: string;
  let emailVerified: boolean;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
    email = decoded.email ?? "";
    emailVerified = decoded.email_verified === true;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, response: err.response };
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  if (!email || !emailVerified) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A verified email is required for paid duels", code: "EMAIL_REQUIRED" },
        { status: 403 }
      ),
    };
  }

  // The wallet rows live on the users table; ensure it exists before we lock it.
  await ensureUser({ id: uid, email, emailVerified });

  return { ok: true, uid, email };
}
