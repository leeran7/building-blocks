/**
 * POST /api/credits/checkout — buy prepaid credits (1 credit = 1¢).
 *
 * Credits are the funding source for paid 1v1 duels. This is the only Stripe
 * touchpoint at play time; staking a duel later is a pure internal balance
 * debit. The webhook (type=credits_topup) settles the top-up into the PLAY
 * bucket idempotently.
 *
 * Server sets amount_cents from amountUsd — the client never supplies cents.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "../../../../src/api/stripe";
import { resolveBaseUrl } from "../../../../src/config/public";
import { checkRateLimit } from "../../../../src/lib/rateLimit";
import { guardPaidDuelRequest } from "../../../../src/lib/paidDuelGuards";
import { recordAgeConfirmation } from "../../../../src/db/user";
import {
  CREDITS_MIN_TOPUP_CENTS,
  CREDITS_MAX_TOPUP_CENTS,
} from "../../../../src/config/paidDuel";
import { chipsForUsd, formatChipCents } from "../../../../src/config/chipPackages";

export const runtime = "nodejs";

const RATE_MAX = 20;
const RATE_WINDOW_SECONDS = 3600;

const BodySchema = z.object({
  amountUsd: z.number().positive(),
  ageConfirmed: z.literal(true),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await guardPaidDuelRequest(request);
  if (!guard.ok) return guard.response;
  const { uid } = guard;

  const rl = await checkRateLimit({
    namespace: "credits:checkout",
    identifier: uid,
    max: RATE_MAX,
    windowSeconds: RATE_WINDOW_SECONDS,
    failMode: "closed",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "You must confirm you are 18+ and provide a valid amount", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  // Server computes cents; clamp to the configured top-up bounds.
  const amountCents = Math.round(parsed.data.amountUsd * 100);
  if (amountCents < CREDITS_MIN_TOPUP_CENTS || amountCents > CREDITS_MAX_TOPUP_CENTS) {
    return NextResponse.json(
      {
        error: `Top-up must be between $${(CREDITS_MIN_TOPUP_CENTS / 100).toFixed(0)} and $${(CREDITS_MAX_TOPUP_CENTS / 100).toFixed(0)}`,
        code: "AMOUNT_OUT_OF_RANGE",
      },
      { status: 400 }
    );
  }

  try {
    await recordAgeConfirmation(uid);
    const stripe = getStripe();
    const baseUrl = resolveBaseUrl();
    const chipAmount = chipsForUsd(parsed.data.amountUsd);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: uid,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `${formatChipCents(chipAmount)} Doomstack chips`,
              description:
                "Non-cashable chips for ranked duels and tournament entries. Chips are non-refundable and cannot be withdrawn.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "credits_topup",
        user_id: uid,
        chip_amount: String(chipAmount),
      },
      success_url: `${baseUrl}/duel?topup=1`,
      cancel_url: `${baseUrl}/duel?topup=0`,
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[POST /api/credits/checkout]", err);
    return NextResponse.json(
      { error: "Could not start checkout", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
