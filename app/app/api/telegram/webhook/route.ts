/**
 * POST /api/telegram/webhook — the Doomstack bot's Bot API webhook.
 *
 * Authenticated by the X-Telegram-Bot-Api-Secret-Token header, compared
 * constant-time with TELEGRAM_WEBHOOK_SECRET (the setWebhook secret_token).
 * A missing env or header is 401.
 *
 *  - pre_checkout_query: re-verify the signed payload, the pack, the Stars
 *    price and currency, and that the payer is the account in the payload,
 *    then answerPreCheckoutQuery ok true, or ok false with a reason.
 *  - message.successful_payment: the same checks again, then creditGemPack
 *    keyed on telegram_payment_charge_id, so a redelivered update credits once.
 *
 * Handled, refused and ignored updates all get 200, so Telegram stops
 * redelivering them; refusals are logged as structured JSON. A transient
 * failure (the database, the Bot API) is 500 so Telegram retries it.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "../../../../src/lib/rateLimit";
import { constantTimeEqual } from "../../../../src/lib/constantTimeEqual";
import { answerPreCheckoutQuery, telegramBotToken, telegramWebhookSecret } from "../../../../src/api/telegramBot";
import {
  checkStarsPayment,
  parseTelegramUpdate,
  REFUSAL_MESSAGES,
  type StarsPaymentClaim,
} from "../../../../src/api/telegramPayments";
import { creditGemPack, GemError } from "../../../../src/db/gems";

export const runtime = "nodejs";

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Telegram sends at most a few updates a second per bot; this only bounds a flood. */
const RATE_LIMIT_MAX = 600;
const RATE_LIMIT_WINDOW_SECONDS = 60;

const ack = () => NextResponse.json({ ok: true });
const retry = () => NextResponse.json({ ok: false }, { status: 500 });

/** Log fields that identify a claim without echoing the whole payload. */
function claimLog(claim: StarsPaymentClaim) {
  return {
    payer_id: typeof claim.payerId === "number" ? claim.payerId : null,
    currency: typeof claim.currency === "string" ? claim.currency : null,
    total_amount: typeof claim.totalAmount === "number" ? claim.totalAmount : null,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Generous and fail-open: the secret is the gate, and a Redis outage must
  // not drop paid updates. Over the limit Telegram simply redelivers later.
  const rl = await checkRateLimit({
    namespace: "telegram:webhook",
    identifier: clientIp(request),
    max: RATE_LIMIT_MAX,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    failMode: "open",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  const secret = telegramWebhookSecret();
  const presented = request.headers.get(SECRET_HEADER);
  if (secret === null || presented === null || !constantTimeEqual(presented, secret)) {
    if (secret === null) console.error(JSON.stringify({ type: "telegram_webhook_unconfigured", missing: "TELEGRAM_WEBHOOK_SECRET" }));
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const botToken = telegramBotToken();
  if (botToken === null) {
    // Not acked: Telegram keeps the update until the token is configured.
    console.error(JSON.stringify({ type: "telegram_webhook_unconfigured", missing: "TELEGRAM_BOT_TOKEN" }));
    return NextResponse.json({ error: "Not configured", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(JSON.stringify({ type: "telegram_webhook_bad_json" }));
    return ack();
  }

  const update = parseTelegramUpdate(body);

  if (update.kind === "pre_checkout") {
    const check = checkStarsPayment(update.claim, botToken);
    if (!check.ok) {
      console.warn(
        JSON.stringify({ type: "telegram_precheckout_refused", refusal: check.refusal, query_id: update.queryId, ...claimLog(update.claim) })
      );
    }
    try {
      await answerPreCheckoutQuery(
        botToken,
        update.queryId,
        check.ok ? { ok: true } : { ok: false, errorMessage: REFUSAL_MESSAGES[check.refusal] }
      );
    } catch (err) {
      console.error(JSON.stringify({ type: "telegram_precheckout_answer_failed", error: err instanceof Error ? err.message : "unknown" }));
      return retry();
    }
    return ack();
  }

  if (update.kind === "payment_without_charge_id") {
    console.error(JSON.stringify({ type: "telegram_payment_unapplied", reason: "NO_CHARGE_ID" }));
    return ack();
  }

  if (update.kind === "payment") {
    const check = checkStarsPayment(update.claim, botToken);
    if (!check.ok) {
      // Paid but not creditable: support refunds it (refundStarPayment) from this line.
      console.error(
        JSON.stringify({ type: "telegram_payment_unapplied", reason: check.refusal, charge_id: update.chargeId, ...claimLog(update.claim) })
      );
      return ack();
    }
    try {
      const result = await creditGemPack({ userId: check.uid, provider: "telegram", externalId: update.chargeId, pack: check.pack });
      console.log(
        JSON.stringify({
          type: "telegram_gem_pack",
          uid: check.uid,
          charge_id: update.chargeId,
          pack_id: check.pack.id,
          outcome: result.outcome,
          timestamp: new Date().toISOString(),
        })
      );
      return ack();
    } catch (err) {
      if (err instanceof GemError && err.code === "NO_USER") {
        console.error(
          JSON.stringify({ type: "telegram_payment_unapplied", reason: "NO_USER", uid: check.uid, charge_id: update.chargeId })
        );
        return ack();
      }
      console.error("[POST /api/telegram/webhook]", err);
      return retry();
    }
  }

  return ack();
}
