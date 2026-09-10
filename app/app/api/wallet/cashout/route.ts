/**
 * POST /api/wallet/cashout — request a withdrawal of winnings.
 *
 * Draws ONLY from the cashable winnings bucket (purchased play credits are never
 * withdrawable). Debits immediately and records a CASHOUT_REQUEST ledger row; an
 * admin fulfils the payout off-platform at MVP (no automated Stripe payout yet).
 *
 * Before that manual fulfilment, requests from an account with a skewed
 * repeat-pairing history (see getSuspiciousPairingForUser) are tagged for
 * review — same debit + ledger row as any other request (there's no
 * automated payout to block), but flagged so whoever fulfils it manually
 * knows to look closer before wiring real money.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "../../../../src/lib/requireAuth";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { requestCashout } from "../../../../src/db/credits";
import { getSuspiciousPairingForUser } from "../../../../src/db/duel";
import { CASHOUT_MIN_CENTS, PAID_DUELS_ENABLED } from "../../../../src/config/paidDuel";

export const runtime = "nodejs";

const BodySchema = z.object({ amountCents: z.number().int().positive() });

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!PAID_DUELS_ENABLED) {
    return NextResponse.json({ error: "Not available", code: "DISABLED" }, { status: 404 });
  }

  let uid: string;
  try {
    const decoded = await requireAuth(request);
    uid = decoded.uid;
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    namespace: "wallet:cashout",
    identifier: uid,
    max: 10,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "amountCents is required", code: "BAD_REQUEST" }, { status: 400 });
  }

  // Heuristic-only, non-blocking: still let the request through (there's no
  // automated payout to gate at MVP either way), just tag it for review.
  const flagged = await getSuspiciousPairingForUser(uid).catch((err) => {
    console.error("[POST /api/wallet/cashout] pairing-skew check failed:", err);
    return false; // fail open — never strand a legitimate cash-out on this check
  });

  const result = await requestCashout(
    uid,
    parsed.data.amountCents,
    CASHOUT_MIN_CENTS,
    flagged ? "FLAGGED: repeat-pairing win-rate skew — review before payout" : undefined
  );

  switch (result.outcome) {
    case "below_min":
      return NextResponse.json(
        {
          error: `Minimum cash-out is $${(CASHOUT_MIN_CENTS / 100).toFixed(2)}`,
          code: "BELOW_MIN",
        },
        { status: 400 }
      );
    case "insufficient":
      return NextResponse.json(
        { error: "Not enough winnings to cash out", code: "INSUFFICIENT_WINNINGS" },
        { status: 409 }
      );
    case "requested":
      // Admin fulfils manually at MVP — surface a structured line to act on.
      console.log(
        JSON.stringify({
          type: flagged ? "wallet_cashout_flagged" : "wallet_cashout_request",
          user_id: uid,
          amount_cents: parsed.data.amountCents,
          winnings_after: result.winningsAfter,
          flagged_for_review: flagged,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json({
        ok: true,
        winningsAfter: result.winningsAfter,
        flaggedForReview: flagged,
      });
  }
}
