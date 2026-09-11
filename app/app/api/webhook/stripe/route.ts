/**
 * POST /api/webhook/stripe
 *
 * Handle Stripe checkout.session.completed events. The only funded flow today
 * is prepaid-credit top-ups for Paid 1v1 Battles; they settle into the buyer's
 * PLAY bucket. (The legacy paid-stacks block-payment flow was removed.)
 *
 * CRITICAL invariants:
 * 1. Verify stripe-signature FIRST — reject 400 if invalid (NFR-S1)
 * 2. Credit only on a genuinely paid status (PAID_STATUSES)
 * 3. Idempotent via CreditPurchase.stripe_session_id (unique)
 * 4. Dead-letter an unattributable captured payment rather than 4xx/5xx
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "../../../../src/api/stripe";
import { PAID_STATUSES, CREDITING_EVENTS } from "../../../../src/api/stripeCredit";
import { recordDeadLetter } from "../../../../src/db/deadLetter";
import { addPurchasedCredits } from "../../../../src/db/credits";
import { settleEntryFee, updatePayoutStatus } from "../../../../src/db/tournaments";

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

  const eventType = event.type as string;

  // Stripe Connect: transfer status updates for tournament prize payouts.
  if (eventType === "transfer.paid" || eventType === "transfer.failed") {
    const transfer = event.data.object as unknown as { id: string };
    const status = eventType === "transfer.paid" ? "transfer_paid" : "transfer_failed";
    await updatePayoutStatus(transfer.id, status);
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as unknown as {
    id: string;
    currency?: string | null;
    metadata: { type?: string; user_id?: string; tournament_id?: string; chip_amount?: string } | null;
    amount_total: number | null;
    payment_status?: string | null;
  };

  // Paid-duel credit top-ups are funded here and settled to the PLAY bucket.
  if (session.metadata?.type === "credits_topup") {
    return handleCreditsTopup(eventType, session);
  }

  // Tournament entry fee — register the user on successful payment.
  if (session.metadata?.type === "tournament_entry") {
    return handleTournamentEntry(eventType, session);
  }

  // Any other session type is not something we fund anymore — acknowledge so
  // Stripe stops retrying. (Historic paid-stack sessions land here and are
  // intentionally ignored.)
  return NextResponse.json({ received: true });
}

/**
 * Register a user for a tournament after their entry fee is paid.
 */
async function handleTournamentEntry(
  eventType: string,
  session: {
    id: string;
    amount_total: number | null;
    payment_status?: string | null;
    metadata: { user_id?: string; tournament_id?: string } | null;
  }
): Promise<NextResponse> {
  if (!CREDITING_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true });
  }
  if (!PAID_STATUSES.has(session.payment_status ?? "")) {
    return NextResponse.json({ received: true, registered: false });
  }

  const userId = session.metadata?.user_id;
  const tournamentId = session.metadata?.tournament_id;

  if (!userId || !tournamentId) {
    return deadLetter(eventType, session.id, session.amount_total ?? 0, "tournament_entry: missing metadata");
  }

  try {
    const result = await settleEntryFee(tournamentId, userId, session.id);
    console.log(
      JSON.stringify({
        type: "tournament_entry",
        stripe_session_id: session.id,
        user_id: userId,
        tournament_id: tournamentId,
        outcome: result.outcome,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json({ received: true });
  } catch (err) {
    // A "not found" error is deterministic — retrying will not fix it.
    // Dead-letter so Stripe stops retrying and the payment is preserved for manual review.
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      return deadLetter(eventType, session.id, session.amount_total ?? 0, `tournament_entry: ${msg}`);
    }
    console.error("[webhook/stripe] tournament_entry settlement failed:", err);
    return NextResponse.json({ error: "Entry settlement failed" }, { status: 500 });
  }
}

/**
 * Settle a credits top-up into the buyer's PLAY bucket.
 *
 * Only credit on a genuinely paid status, idempotent via
 * CreditPurchase.stripe_session_id (unique), and dead-letter an unattributable
 * event rather than 4xx/5xx (Stripe must not silently lose or endlessly retry a
 * deterministic miss).
 */
async function handleCreditsTopup(
  eventType: string,
  session: {
    id: string;
    currency?: string | null;
    amount_total: number | null;
    payment_status?: string | null;
    metadata: { user_id?: string; chip_amount?: string } | null;
  }
): Promise<NextResponse> {
  if (!CREDITING_EVENTS.has(eventType)) {
    return NextResponse.json({ received: true });
  }
  if (!PAID_STATUSES.has(session.payment_status ?? "")) {
    console.log(
      JSON.stringify({
        type: "credits_topup_unpaid",
        stripe_session_id: session.id,
        payment_status: session.payment_status ?? null,
      })
    );
    return NextResponse.json({ received: true, credited: false });
  }

  if ((session.currency ?? "usd").toLowerCase() !== "usd") {
    return deadLetter(eventType, session.id, 0, `credits_topup: unexpected currency ${session.currency}`);
  }

  const userId = session.metadata?.user_id;
  // chip_amount in metadata is the display chip count (e.g. 500 for a $5 purchase).
  // play_credits_cents uses 100 units per display chip, so multiply by 100.
  // Fall back to amount_total (USD cents, $1 = 100 chips = 10000 play_credits_cents)
  // for legacy sessions predating the chip_amount metadata field.
  const chipDisplayCount = session.metadata?.chip_amount
    ? parseInt(session.metadata.chip_amount, 10)
    : (session.amount_total ?? 0);
  const chipAmountCents = chipDisplayCount * 100;
  const chargeCents = session.amount_total ?? 0;

  if (!session.id) {
    return deadLetter(eventType, "", chargeCents, "credits_topup: missing session id");
  }
  if (!userId) {
    return deadLetter(eventType, session.id, chargeCents, "credits_topup: missing user_id");
  }
  if (!Number.isFinite(chipAmountCents) || chipAmountCents <= 0) {
    return deadLetter(eventType, session.id, chargeCents, "credits_topup: invalid amount");
  }

  try {
    const result = await addPurchasedCredits(userId, session.id, chipAmountCents);
    console.log(
      JSON.stringify({
        type: "credits_topup",
        stripe_session_id: session.id,
        user_id: userId,
        charge_cents: chargeCents,
        chip_display_count: chipDisplayCount,
        chip_amount_cents: chipAmountCents,
        outcome: result.outcome,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook/stripe] credits_topup transaction failed:", err);
    return NextResponse.json({ error: "Credit top-up processing failed" }, { status: 500 });
  }
}

/**
 * Record a captured payment we cannot attribute, and tell Stripe to stop.
 *
 * Returning 4xx or 5xx for these is worse in both directions: Stripe does not
 * retry a 4xx, so the payment is silently lost, and a 5xx for a condition that
 * is deterministic in our own data fails identically on every retry until
 * Stripe gives up — losing it anyway, slower, after alert noise. Persist a
 * replayable row first, then acknowledge. A persist failure is still 200 —
 * Stripe must not retry a deterministic miss — and the log line remains.
 */
async function deadLetter(
  eventType: string,
  stripeSessionId: string,
  amountCents: number,
  reason: string
): Promise<NextResponse> {
  try {
    await recordDeadLetter({
      eventType,
      stripeSessionId,
      amountCents,
      reason,
    });
  } catch (err) {
    console.error("[webhook/stripe] dead-letter persist failed:", err);
  }
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
