/**
 * Shared Stripe checkout event gating constants.
 *
 * Extracted from the webhook route so payment_status gating can be asserted by
 * importing these sets, not by grepping the route source. The route owns
 * signature verification, idempotency, and the DB writes.
 */

export const CREDITING_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

/** Session payment states that mean the money is actually ours. */
export const PAID_STATUSES = new Set(["paid", "no_payment_required"]);
