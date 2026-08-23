/**
 * POST /api/admin/refund
 *
 * Trigger Stripe full refund for all payments for a given block.
 * Requires: Authorization: Bearer {ADMIN_SECRET}
 * Action is logged (AC-50).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/api/middleware/requireAdmin";
import { getBlockById } from "../../../../src/db/blocks";
import { getPaymentsByBlock } from "../../../../src/db/payments";
import { getStripe } from "../../../../src/api/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { block_id } = body;

    if (!block_id || typeof block_id !== "string") {
      return NextResponse.json(
        { error: "block_id is required" },
        { status: 400 }
      );
    }

    const block = await getBlockById(block_id);
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const payments = await getPaymentsByBlock(block_id);
    if (!payments.length) {
      return NextResponse.json(
        { error: "No payments found for this block" },
        { status: 404 }
      );
    }

    const stripe = getStripe();
    let refunded_count = 0;
    let total_refunded_cents = 0;

    // Issue full refund for each payment (OQ-7: MVP = full refund only)
    for (const payment of payments) {
      try {
        // Retrieve the checkout session to get the payment intent
        const session = await stripe.checkout.sessions.retrieve(
          payment.stripe_session_id
        );

        if (session.payment_intent) {
          await stripe.refunds.create({
            payment_intent: session.payment_intent as string,
          });
          refunded_count++;
          total_refunded_cents += payment.amount_cents;
        }
      } catch (err) {
        console.error(
          `[admin/refund] Failed to refund payment ${payment.id}:`,
          err
        );
        // Continue with other payments
      }
    }

    console.log(
      JSON.stringify({
        type: "admin_action",
        action: "refund",
        block_id,
        refunded_count,
        total_refunded_cents,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({ refunded_count, total_refunded_cents });
  } catch (error) {
    console.error("[POST /api/admin/refund]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
