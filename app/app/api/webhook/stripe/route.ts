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
import { computeMetres } from "../../../../src/engine/index";
import { updatePeakRank, getRankedBlocks, getBlockById } from "../../../../src/db/blocks";
import { parseSeasonSlug } from "../../../../src/game/categories";

// Disable body parsing — need raw body for Stripe signature verification
export const runtime = "nodejs";

/**
 * Events that can grant altitude. async_payment_succeeded is the settlement
 * signal for delayed-notification methods, whose checkout.session.completed
 * arrives unpaid.
 */
const CREDITING_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/** Session payment states that mean the money is actually ours. */
const PAID_STATUSES = new Set(["paid", "no_payment_required"]);

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

  if (!CREDITING_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as unknown as {
    id: string;
    metadata: { block_id: string; season_id: string; category?: string } | null;
    amount_total: number | null;
    payment_status?: string | null;
  };

  const stripeSessionId = session.id;
  const blockId = session.metadata?.block_id;
  const amountTotal = session.amount_total ?? 0;

  // Money must have actually moved. checkout.session.completed fires as soon as
  // the customer finishes the flow, and for a delayed-notification method
  // (bank debits, some wallets) that happens with payment_status "unpaid" —
  // settlement can still fail days later. Which methods are enabled is a
  // Stripe Dashboard setting when payment_method_types is omitted at session
  // creation, as it is in app/api/checkout, so this cannot be ruled out from
  // the repo. Credit is granted on the later async_payment_succeeded instead.
  if (!PAID_STATUSES.has(session.payment_status ?? "")) {
    console.log(
      JSON.stringify({
        type: "payment_webhook_unpaid",
        stripe_session_id: stripeSessionId,
        payment_status: session.payment_status ?? null,
        event: event.type,
      })
    );
    return NextResponse.json({ received: true, credited: false });
  }

  if (!blockId) {
    return deadLetter(event.type, stripeSessionId, amountTotal, "missing block_id");
  }

  // Step 2: Idempotency check — check for existing payment BEFORE any write (AC-32)
  const existingPayment = await findPaymentByStripeSession(stripeSessionId);
  if (existingPayment) {
    return NextResponse.json({ received: true });
  }

  const blockRow = await getBlockById(blockId);
  if (!blockRow) {
    return deadLetter(
      event.type,
      stripeSessionId,
      amountTotal,
      `unknown block_id ${blockId}`
    );
  }

  // Season comes from the block row, not checkout metadata.
  const category =
    parseSeasonSlug(blockRow.category) ??
    parseSeasonSlug(session.metadata?.category);

  if (!category) {
    return deadLetter(
      event.type,
      stripeSessionId,
      amountTotal,
      `unparseable stack "${blockRow.category}" on block ${blockId}`
    );
  }

  // Step 3-5: Atomic transaction (AC-33)
  try {
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
      const allBlocks = await getRankedBlocks(category);
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
    // 500 is correct here and only here: a failed transaction is plausibly
    // transient (database unavailable, lock timeout), so Stripe's retry is
    // exactly what we want. The deterministic failures above cannot benefit
    // from a retry and are dead-lettered instead.
    console.error("[webhook/stripe] Transaction failed:", error);
    return NextResponse.json(
      { error: "Payment processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Record a captured payment we cannot attribute, and tell Stripe to stop.
 *
 * Returning 4xx or 5xx for these is worse in both directions: Stripe does not
 * retry a 4xx, so the payment is silently lost, and a 5xx for a condition that
 * is deterministic in our own data fails identically on every retry until
 * Stripe gives up — losing it anyway, slower, after alert noise. The event is
 * logged in a greppable shape so it can be replayed by hand, and acknowledged.
 */
function deadLetter(
  eventType: string,
  stripeSessionId: string,
  amountCents: number,
  reason: string
): NextResponse {
  console.error(
    JSON.stringify({
      type: "payment_webhook_dead_letter",
      event: eventType,
      stripe_session_id: stripeSessionId,
      amount_cents: amountCents,
      reason,
      timestamp: new Date().toISOString(),
    })
  );
  return NextResponse.json({ received: true, dead_lettered: true });
}
