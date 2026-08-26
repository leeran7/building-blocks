/**
 * POST /api/webhook/stripe
 *
 * Handle Stripe checkout.session.completed events.
 *
 * CRITICAL invariants:
 * 1. Verify stripe-signature FIRST — reject 400 if invalid (NFR-S1)
 * 2. Check stripe_session_id duplicate BEFORE any write (AC-32 idempotency)
 * 3. Compute metres from LIVE views_k (not checkout-time rate) (spec §3.7)
 * 4. UPDATE altitude = altitude + metres (additive, never set) (ADR-7)
 * 5. All writes in a single DB transaction (AC-33)
 * 6. Server NEVER trusts client-supplied rate/metres/growth (NFR-S2)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "../../../../src/api/stripe";
import { findPaymentByStripeSession, applyPaymentTransaction } from "../../../../src/db/payments";
import { getOrCreateActiveSeason } from "../../../../src/db/seasons";
import { computeMetres, computeGround } from "../../../../src/engine/index";
import { updatePeakRank } from "../../../../src/db/blocks";
import { getRankedBlocks } from "../../../../src/db/blocks";

// Disable body parsing — need raw body for Stripe signature verification
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  // Step 1: Verify Stripe signature (NFR-S1)
  // Reject with 400 if invalid — before any other processing
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: ReturnType<typeof verifyWebhookSignature>;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    console.error("[webhook/stripe] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  // Only handle checkout.session.completed
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as unknown as {
    id: string;
    metadata: { block_id: string; season_id: string; category?: string } | null;
    amount_total: number | null;
  };

  const stripeSessionId = session.id;
  const blockId = session.metadata?.block_id;
  const amountTotal = session.amount_total ?? 0;
  // Resolve category slug from metadata — falls back to "tech" for legacy sessions.
  const rawCategory = session.metadata?.category?.toLowerCase();
  const category: string =
    rawCategory && /^[a-z0-9][a-z0-9-]{0,63}$/.test(rawCategory) ? rawCategory : "tech";

  if (!blockId) {
    console.error("[webhook/stripe] Missing block_id in metadata:", session.id);
    return NextResponse.json({ error: "Missing block_id" }, { status: 400 });
  }

  // Step 2: Idempotency check — check for existing payment BEFORE any write (AC-32)
  const existingPayment = await findPaymentByStripeSession(stripeSessionId);
  if (existingPayment) {
    // Already processed — return 200 no-op (idempotent)
    return NextResponse.json({ received: true });
  }

  // Step 3-5: Atomic transaction (AC-33)
  try {
    // Get LIVE views_k for this block's category at settlement time (spec §3.7)
    const activeSeason = await getOrCreateActiveSeason(category);
    const V = activeSeason.views_k;

    // Server computes metres from LIVE rate — never trusts client-supplied value
    const amountDollars = amountTotal / 100;
    // CRITICAL: computeMetres uses server-side V, not anything from the client
    const metresAdded = computeMetres(amountDollars, V);

    // Apply payment in a single transaction (AC-33):
    // UPDATE altitude = altitude + metresAdded (additive)
    // INSERT payment row
    const { block } = await applyPaymentTransaction(
      blockId,
      stripeSessionId,
      amountTotal,
      metresAdded
    );

    // Update peak_rank (best-effort, not in the main transaction)
    try {
      const allBlocks = await getRankedBlocks();
      const rank = allBlocks.findIndex((b) => b.id === blockId) + 1;
      if (rank > 0) {
        await updatePeakRank(blockId, rank);
      }
    } catch (err) {
      // Non-critical — don't fail the webhook for peak_rank update failure
      console.warn("[webhook/stripe] peak_rank update failed:", err);
    }

    console.log(
      JSON.stringify({
        type: "payment_webhook",
        block_id: blockId,
        stripe_session_id: stripeSessionId,
        amount_cents: amountTotal,
        metres_added: metresAdded,
        new_altitude: block.altitude,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook/stripe] Transaction failed:", error);
    return NextResponse.json(
      { error: "Payment processing failed" },
      { status: 500 }
    );
  }
}
