/**
 * Stripe SDK singleton + webhook verification helper.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });

  return _stripe;
}

/**
 * Verify Stripe webhook signature and return the event.
 * Throws if signature is invalid (NFR-S1).
 *
 * @param rawBody - raw request body as string
 * @param signature - stripe-signature header value
 * @returns verified Stripe event
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): Stripe.Event {
  const secrets = webhookSecrets();
  let lastError: unknown;

  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Invalid webhook signature");
}

function webhookSecrets(): string[] {
  const raw = process.env.STRIPE_WEBHOOK_SECRET;
  if (!raw) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const secrets = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (secrets.length === 0) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return secrets;
}
