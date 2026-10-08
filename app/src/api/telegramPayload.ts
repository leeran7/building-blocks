/**
 * The Stars invoice payload: binds an invoice to one account and one gem pack
 * so the webhook can settle a payment without trusting anything else in it.
 *
 *   v1|<uid>|<packId>|<base64url HMAC_SHA256(key, "v1|<uid>|<packId>")>
 *
 * The key is derived from the bot token with a fixed label, so no extra secret
 * has to be configured; only this server holds the token. Telegram echoes the
 * payload back on pre_checkout_query and successful_payment, and both are
 * re-verified here (constant-time) before a pack is looked up. Server-only.
 */

import { createHmac } from "node:crypto";
import { constantTimeEqual } from "./middleware/requireAdmin";
import { platformUid } from "../lib/platformAuth";
import { gemPackById, type GemPack } from "../lib/gemPacks";

const VERSION = "v1";
const SEP = "|";

/** Domain separation: this key signs invoice payloads and nothing else. */
const KEY_LABEL = "doomstack:telegram-invoice-payload:v1";

/** Telegram's limit on an invoice payload. */
export const MAX_PAYLOAD_BYTES = 128;

const TELEGRAM_UID = /^telegram:([1-9][0-9]{0,19})$/;

function payloadKey(botToken: string): Buffer {
  return createHmac("sha256", KEY_LABEL).update(botToken).digest();
}

function sign(body: string, botToken: string): string {
  return createHmac("sha256", payloadKey(botToken)).update(body).digest("base64url");
}

/** The Telegram user id inside a `telegram:<id>` uid, or null for any other uid. */
export function telegramIdOfUid(uid: string): string | null {
  const m = TELEGRAM_UID.exec(uid);
  if (m === null || platformUid("telegram", m[1]) !== uid) return null;
  return m[1];
}

/** A signed payload for `uid` buying `pack`. Throws if it would not fit Telegram's limit. */
export function signInvoicePayload(uid: string, pack: GemPack, botToken: string): string {
  const body = [VERSION, uid, pack.id].join(SEP);
  const payload = `${body}${SEP}${sign(body, botToken)}`;
  if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) throw new Error("invoice payload too long");
  return payload;
}

export type PayloadCheck =
  | { ok: true; uid: string; telegramUserId: string; pack: GemPack }
  | { ok: false; refusal: "BAD_PAYLOAD" | "UNKNOWN_PACK" };

/** Verify a payload Telegram echoed back. The signature is checked before any field is used. */
export function verifyInvoicePayload(payload: unknown, botToken: string): PayloadCheck {
  if (typeof payload !== "string" || payload.length > MAX_PAYLOAD_BYTES) return { ok: false, refusal: "BAD_PAYLOAD" };
  const parts = payload.split(SEP);
  if (parts.length !== 4) return { ok: false, refusal: "BAD_PAYLOAD" };
  const [version, uid, packId, signature] = parts;
  if (version !== VERSION) return { ok: false, refusal: "BAD_PAYLOAD" };
  const expected = sign([version, uid, packId].join(SEP), botToken);
  if (!constantTimeEqual(expected, signature)) return { ok: false, refusal: "BAD_PAYLOAD" };

  const telegramUserId = telegramIdOfUid(uid);
  if (telegramUserId === null) return { ok: false, refusal: "BAD_PAYLOAD" };
  const pack = gemPackById(packId);
  if (pack === null) return { ok: false, refusal: "UNKNOWN_PACK" };
  return { ok: true, uid, telegramUserId, pack };
}
