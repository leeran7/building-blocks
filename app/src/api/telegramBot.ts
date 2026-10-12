/**
 * The few Telegram Bot API calls the server makes, and the env it needs.
 *
 * The base URL is fixed (https://api.telegram.org/bot<token>/<method>) and the
 * method comes from a closed list: nothing in a request can steer where the
 * token is sent. The URL carries the token, so it is never logged. Server-only.
 */

/** The bot's token (BotFather). Missing means Telegram features are off: 503, never a bypass. */
export function telegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? token : null;
}

/** The secret Telegram sends in X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token). */
export function telegramWebhookSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  return secret ? secret : null;
}

const BOT_API_ORIGIN = "https://api.telegram.org";

/** Bot API calls stall rarely, but a webhook must answer pre-checkout within 10 seconds. */
const BOT_API_TIMEOUT_MS = 8000;

type BotMethod = "createInvoiceLink" | "answerPreCheckoutQuery";

/** A Bot API call that failed: Telegram said ok: false, or the request itself failed. */
export class TelegramApiError extends Error {
  constructor(
    public readonly method: BotMethod,
    message: string,
  ) {
    super(`${method}: ${message}`);
    this.name = "TelegramApiError";
  }
}

async function callBotApi(token: string, method: BotMethod, params: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BOT_API_ORIGIN}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(BOT_API_TIMEOUT_MS),
    });
  } catch (err) {
    // The error text can include the URL, and so the token: keep only its name.
    throw new TelegramApiError(method, err instanceof Error ? err.name : "request failed");
  }
  const body = (await res.json().catch(() => null)) as { ok?: unknown; result?: unknown; description?: unknown } | null;
  if (body?.ok !== true) {
    throw new TelegramApiError(method, typeof body?.description === "string" ? body.description : `HTTP ${res.status}`);
  }
  return body.result;
}

export interface StarsInvoice {
  /** 1-32 characters. */
  title: string;
  /** 1-255 characters. */
  description: string;
  /** The signed payload (telegramPayload.ts). */
  payload: string;
  /** The price in Stars. */
  stars: number;
}

/** Create a Stars invoice link (one price, currency XTR, no provider token). */
export async function createStarsInvoiceLink(token: string, invoice: StarsInvoice): Promise<string> {
  const result = await callBotApi(token, "createInvoiceLink", {
    title: invoice.title,
    description: invoice.description,
    payload: invoice.payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: invoice.title, amount: invoice.stars }],
  });
  if (typeof result !== "string" || !result.startsWith("https://t.me/")) {
    throw new TelegramApiError("createInvoiceLink", "unexpected result");
  }
  return result;
}

/** Approve or refuse a pre-checkout query. `errorMessage` is shown to the buyer on refusal. */
export async function answerPreCheckoutQuery(
  token: string,
  queryId: string,
  answer: { ok: true } | { ok: false; errorMessage: string },
): Promise<void> {
  await callBotApi(token, "answerPreCheckoutQuery", {
    pre_checkout_query_id: queryId,
    ok: answer.ok,
    ...(answer.ok ? {} : { error_message: answer.errorMessage }),
  });
}
