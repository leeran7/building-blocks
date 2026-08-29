/**
 * Credit / ignore / dead-letter decision for a Stripe checkout event.
 *
 * Extracted from the webhook route so payment_status gating can be asserted
 * by invoking this function, not by grepping the route source. The route still
 * owns signature verification, idempotency, and the DB writes.
 */

export const CREDITING_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/** Session payment states that mean the money is actually ours. */
export const PAID_STATUSES = new Set(["paid", "no_payment_required"]);

export function classifyStripeCredit(
  eventType: string,
  session: StripeCheckoutSession
): StripeCreditDecision {
  if (!CREDITING_EVENTS.has(eventType)) {
    return { kind: "ignore" };
  }

  const stripeSessionId = session.id ?? "";
  const amountCents = session.amount_total ?? 0;
  const paymentStatus = session.payment_status ?? null;

  if (!PAID_STATUSES.has(paymentStatus ?? "")) {
    return {
      kind: "unpaid",
      stripeSessionId,
      paymentStatus,
      eventType,
    };
  }

  const blockId = session.metadata?.block_id;
  if (!stripeSessionId) {
    return {
      kind: "dead_letter",
      eventType,
      stripeSessionId: "",
      amountCents,
      reason: "missing session id",
    };
  }
  if (!blockId) {
    return {
      kind: "dead_letter",
      eventType,
      stripeSessionId,
      amountCents,
      reason: "missing block_id",
    };
  }

  return {
    kind: "credit",
    eventType,
    stripeSessionId,
    blockId,
    amountCents,
    categoryHint: session.metadata?.category,
  };
}

export interface StripeCheckoutSession {
  id?: string;
  amount_total?: number | null;
  payment_status?: string | null;
  metadata?: { block_id?: string; category?: string } | null;
}

export type StripeCreditDecision =
  | { kind: "ignore" }
  | {
      kind: "unpaid";
      stripeSessionId: string;
      paymentStatus: string | null;
      eventType: string;
    }
  | {
      kind: "dead_letter";
      eventType: string;
      stripeSessionId: string;
      amountCents: number;
      reason: string;
    }
  | {
      kind: "credit";
      eventType: string;
      stripeSessionId: string;
      blockId: string;
      amountCents: number;
      categoryHint?: string;
    };
