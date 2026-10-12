/**
 * Gem packs in Telegram Stars (PaymentsAdapter.buyGemPack). Loaded lazily by
 * config.ts on the first purchase.
 *
 * The server makes the invoice (POST /api/gems/telegram/invoice), Telegram
 * shows it (WebApp.openInvoice), and the bot webhook credits the gems once
 * Telegram confirms the payment. So "paid" here only means the money moved:
 * the Shop balance is polled until the gems land, and if the webhook is slow
 * the player is told they are on the way (the Shop refreshes on reopen).
 */

import type { GemPack } from "@app/lib/gemPacks";
import { apiFetch } from "../../lib/api";
import { fetchShop, ShopError, type PackPurchaseResult } from "../../lib/shop";
import { currentWebApp, isInTelegram, type InvoiceStatus, type TelegramWebApp } from "./webApp";

/** How often, and how many times, to look for the webhook's credit after "paid". */
export const CREDIT_POLL_INTERVAL_MS = 1500;
export const CREDIT_POLL_ATTEMPTS = 10;

const INVOICE_LINK_PREFIX = "https://t.me/";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function shopErrorOf(res: Response, fallback: string): Promise<ShopError> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  return new ShopError(
    typeof body.error === "string" ? body.error : fallback,
    typeof body.code === "string" ? body.code : null,
  );
}

async function createInvoice(pack: GemPack): Promise<string> {
  let res: Response;
  try {
    res = await apiFetch("/api/gems/telegram/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: pack.id }),
    });
  } catch {
    throw new ShopError("Couldn't reach the Shop. Check your connection and try again.", null);
  }
  if (!res.ok) throw await shopErrorOf(res, "Couldn't start the payment. Try again.");
  const body = (await res.json().catch(() => null)) as { invoiceLink?: unknown } | null;
  const link = body?.invoiceLink;
  if (typeof link !== "string" || !link.startsWith(INVOICE_LINK_PREFIX)) {
    throw new ShopError("Couldn't start the payment. Try again.", null);
  }
  return link;
}

function openInvoice(app: TelegramWebApp, link: string): Promise<InvoiceStatus> {
  return new Promise((resolve, reject) => {
    try {
      app.openInvoice(link, (status) => resolve(status));
    } catch {
      reject(new ShopError("Update Telegram to buy gems with Stars.", "UNSUPPORTED"));
    }
  });
}

/** The balance once it reaches `target`, or null if it has not by the last poll. */
async function waitForCredit(target: number): Promise<number | null> {
  for (let i = 0; i < CREDIT_POLL_ATTEMPTS; i++) {
    await sleep(CREDIT_POLL_INTERVAL_MS);
    const gems = await fetchShop()
      .then((s) => s.gems)
      .catch(() => null);
    if (gems !== null && gems >= target) return gems;
  }
  return null;
}

const onTheWay = () =>
  new ShopError("Payment received. Your gems arrive in a moment: reopen the Shop to see them.", "PENDING");

/** Buy one pack with Stars. Throws ShopError on failure; "cancelled" when the player closes the invoice. */
export async function buyStarsPack(pack: GemPack): Promise<PackPurchaseResult> {
  const app = currentWebApp();
  if (!isInTelegram(app)) throw new ShopError("Open Doomstack from Telegram to buy gems.", "NOT_IN_TELEGRAM");

  // The balance before paying, so the credit can be told apart from it.
  const before = await fetchShop()
    .then((s) => s.gems)
    .catch(() => null);
  const link = await createInvoice(pack);
  const status = await openInvoice(app, link);

  if (status === "cancelled") return { kind: "cancelled" };
  if (status === "failed") throw new ShopError("The payment didn't go through. Try again.", "PAYMENT_FAILED");
  if (status !== "paid") {
    throw new ShopError("Telegram is still processing your payment. Your gems arrive once it completes.", "PENDING");
  }
  if (before === null) throw onTheWay();
  const gems = await waitForCredit(before + pack.gems);
  if (gems === null) throw onTheWay();
  return { kind: "credited", gems };
}
