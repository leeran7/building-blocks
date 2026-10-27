/**
 * Telegram Stars settlement rules, shared by both webhook steps:
 *  - pre_checkout_query: approve only what the server would credit;
 *  - message.successful_payment: credit only what passes the same checks.
 *
 * Every check is against the server's own state: the signed payload
 * (telegramPayload.ts), the pack table, the Stars price table and the paying
 * Telegram user. Nothing in the update is trusted until the payload verifies.
 * Server-only.
 */

import type { GemPack } from "../lib/gemPacks";
import { verifyInvoicePayload } from "./telegramPayload";
import { STARS_CURRENCY, starsPrice } from "./telegramStars";

export type StarsRefusal = "BAD_PAYLOAD" | "UNKNOWN_PACK" | "WRONG_CURRENCY" | "WRONG_AMOUNT" | "WRONG_PAYER";

export type StarsCheck = { ok: true; uid: string; pack: GemPack } | { ok: false; refusal: StarsRefusal };

/** What Telegram reports about a payment, in either webhook step. Fields are unvalidated. */
export interface StarsPaymentClaim {
  payload: unknown;
  currency: unknown;
  totalAmount: unknown;
  /** `from.id` of the pre-checkout query or the payment message. */
  payerId: unknown;
}

/** Shown to the buyer when a pre-checkout is refused. */
export const REFUSAL_MESSAGES: Record<StarsRefusal, string> = {
  BAD_PAYLOAD: "This invoice isn't valid anymore. Open the Shop and try again.",
  UNKNOWN_PACK: "This gem pack isn't sold anymore. Open the Shop and try again.",
  WRONG_CURRENCY: "This invoice isn't valid anymore. Open the Shop and try again.",
  WRONG_AMOUNT: "The price changed. Open the Shop and try again.",
  WRONG_PAYER: "This invoice belongs to another player. Open the Shop from your own Telegram account.",
};

/** A Telegram user id as Telegram sends it: a positive safe integer. Null otherwise. */
function telegramIdString(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) return null;
  return String(v);
}

/** Check a payment claim against the signed payload, the pack, its Stars price and the payer. */
export function checkStarsPayment(claim: StarsPaymentClaim, botToken: string): StarsCheck {
  const payload = verifyInvoicePayload(claim.payload, botToken);
  if (!payload.ok) return { ok: false, refusal: payload.refusal };
  if (claim.currency !== STARS_CURRENCY) return { ok: false, refusal: "WRONG_CURRENCY" };
  const price = starsPrice(payload.pack);
  if (price === null) return { ok: false, refusal: "UNKNOWN_PACK" };
  if (claim.totalAmount !== price) return { ok: false, refusal: "WRONG_AMOUNT" };
  if (telegramIdString(claim.payerId) !== payload.telegramUserId) return { ok: false, refusal: "WRONG_PAYER" };
  return { ok: true, uid: payload.uid, pack: payload.pack };
}

/** The Bot API update shapes the webhook acts on. Everything else is ignored. */
export type TelegramUpdate =
  | { kind: "pre_checkout"; queryId: string; claim: StarsPaymentClaim }
  | { kind: "payment"; chargeId: string; claim: StarsPaymentClaim }
  /** A successful_payment with no charge id: cannot be credited idempotently, so it is logged for support. */
  | { kind: "payment_without_charge_id" }
  | { kind: "ignored" };

function objectOf(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function fromIdOf(v: unknown): unknown {
  return objectOf(v)?.id;
}

/** Narrow a webhook body to the update kinds handled here. */
export function parseTelegramUpdate(body: unknown): TelegramUpdate {
  const update = objectOf(body);
  if (update === null) return { kind: "ignored" };

  const query = objectOf(update.pre_checkout_query);
  if (query !== null && typeof query.id === "string" && query.id !== "") {
    return {
      kind: "pre_checkout",
      queryId: query.id,
      claim: {
        payload: query.invoice_payload,
        currency: query.currency,
        totalAmount: query.total_amount,
        payerId: fromIdOf(query.from),
      },
    };
  }

  const message = objectOf(update.message);
  const payment = objectOf(message?.successful_payment);
  if (message !== null && payment !== null) {
    const chargeId = payment.telegram_payment_charge_id;
    if (typeof chargeId !== "string" || chargeId === "") return { kind: "payment_without_charge_id" };
    return {
      kind: "payment",
      chargeId,
      claim: {
        payload: payment.invoice_payload,
        currency: payment.currency,
        totalAmount: payment.total_amount,
        payerId: fromIdOf(message.from),
      },
    };
  }

  return { kind: "ignored" };
}
