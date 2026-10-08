/**
 * POST /api/gems/telegram/invoice { packId } — a Telegram Stars invoice link
 * for one gem pack, opened in the Mini App with Telegram.WebApp.openInvoice.
 *
 * The price comes from the server's Stars table (src/api/telegramStars.ts);
 * the body names only the pack. The invoice payload is signed and binds this
 * account and pack (src/api/telegramPayload.ts). Nothing is credited here: the
 * bot webhook (POST /api/telegram/webhook) re-checks the payload, price and
 * payer, and credits once on Telegram's payment charge id.
 *
 * 200 { invoiceLink }
 * 400 BAD_REQUEST | UNKNOWN_PACK
 * 403 NOT_TELEGRAM_ACCOUNT  only a telegram:<id> account can pay in Stars
 * 429 RATE_LIMITED
 * 502 TELEGRAM_ERROR        the Bot API refused or did not answer
 * 503 NOT_CONFIGURED        TELEGRAM_BOT_TOKEN is not set
 *
 * Auth required (Firebase Bearer token).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../src/lib/api/withAuth";
import { checkRateLimit } from "../../../../../src/lib/rateLimit";
import { formatGems } from "../../../../../src/lib/avatars";
import { gemPackById } from "../../../../../src/lib/gemPacks";
import { createStarsInvoiceLink, telegramBotToken } from "../../../../../src/api/telegramBot";
import { signInvoicePayload, telegramIdOfUid } from "../../../../../src/api/telegramPayload";
import { starsPrice } from "../../../../../src/api/telegramStars";

export const runtime = "nodejs";

export const POST = withAuth(async (request: NextRequest, uid: string) => {
  const rl = await checkRateLimit({
    namespace: "gems:telegram:invoice",
    identifier: uid,
    max: 20,
    windowSeconds: 3600,
    failMode: "closed",
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const pack = gemPackById(typeof body === "object" && body !== null ? (body as { packId?: unknown }).packId : null);
  const stars = pack === null ? null : starsPrice(pack);
  if (pack === null || stars === null) {
    return NextResponse.json({ error: "Unknown gem pack", code: "UNKNOWN_PACK" }, { status: 400 });
  }

  // The webhook credits only when the payer is the account in the payload, so
  // any other account would pay and get nothing: refuse before money moves.
  if (telegramIdOfUid(uid) === null) {
    return NextResponse.json(
      { error: "Open Doomstack from Telegram to pay with Stars", code: "NOT_TELEGRAM_ACCOUNT" },
      { status: 403 }
    );
  }

  const botToken = telegramBotToken();
  if (botToken === null) {
    console.error(JSON.stringify({ type: "telegram_invoice_unconfigured", missing: "TELEGRAM_BOT_TOKEN" }));
    return NextResponse.json({ error: "Stars payments are not available", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const invoiceLink = await createStarsInvoiceLink(botToken, {
      title: `${formatGems(pack.gems)} gems`,
      description: "Gems for characters, skins and lives in Doomstack. Non-refundable and not cashable.",
      payload: signInvoicePayload(uid, pack, botToken),
      stars,
    });
    return NextResponse.json({ invoiceLink });
  } catch (err) {
    console.error(
      JSON.stringify({ type: "telegram_invoice_failed", uid, pack_id: pack.id, error: err instanceof Error ? err.message : "unknown" })
    );
    return NextResponse.json({ error: "Couldn't reach Telegram. Try again.", code: "TELEGRAM_ERROR" }, { status: 502 });
  }
});
