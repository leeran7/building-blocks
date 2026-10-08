/**
 * Telegram Mini App sign-in: verify `Telegram.WebApp.initData` with the bot
 * token, per Telegram's "Validating data received via the Mini App" spec.
 *
 *  - initData is a URL query string. Every field except `hash`, as
 *    `key=value`, sorted by key and joined with "\n", is the data-check-string.
 *  - secret = HMAC_SHA256(key = "WebAppData", msg = bot token)
 *  - hash   = hex(HMAC_SHA256(key = secret, msg = data-check-string))
 *
 * Reject, never default: a missing or malformed field fails the whole check,
 * and the user id comes only from the signed `user` JSON. Server-only.
 */

import { createHmac } from "node:crypto";
import { constantTimeEqual } from "./middleware/requireAdmin";
import { platformUid } from "../lib/platformAuth";

/** How long a Mini App launch stays good for sign-in. Telegram re-signs initData on every launch. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Clock skew tolerated for an `auth_date` slightly in the future. */
export const INIT_DATA_FUTURE_SKEW_SECONDS = 60;

/** Real initData is well under 1 KB; anything this long is not from Telegram. */
const MAX_INIT_DATA_LENGTH = 4096;

const HASH_HEX = /^[0-9a-f]{64}$/;
const UNIX_SECONDS = /^[1-9][0-9]{0,11}$/;

export type InitDataRefusal =
  | "MISSING" // not a non-empty string
  | "MALFORMED" // too long, duplicate keys, no hash, bad auth_date
  | "BAD_HASH" // the signature does not match this bot
  | "EXPIRED" // auth_date older than the freshness window
  | "FUTURE" // auth_date ahead of the server clock beyond skew
  | "NO_USER" // no `user` field
  | "BAD_USER"; // `user` is not JSON, or its id is not a positive integer

export type InitDataCheck =
  | { ok: true; telegramUserId: string; authDate: number }
  | { ok: false; refusal: InitDataRefusal };

/** The Mini App secret key for a bot: HMAC_SHA256("WebAppData", token). */
function webAppSecret(botToken: string): Buffer {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

/** Hex hash Telegram puts on initData whose data-check-string is `dataCheckString`. */
export function initDataHash(dataCheckString: string, botToken: string): string {
  return createHmac("sha256", webAppSecret(botToken)).update(dataCheckString).digest("hex");
}

/** Every field but `hash`, `key=value`, sorted by key, joined by "\n". */
export function dataCheckString(fields: ReadonlyMap<string, string>): string {
  return [...fields.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/** Parse the query string into a map, or null when any key repeats (ambiguous, so refused). */
function parseFields(initData: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(initData)) {
    if (fields.has(key)) return null;
    fields.set(key, value);
  }
  return fields;
}

/** The Telegram user id from the signed `user` JSON, as a decimal string, or null. */
function userIdOf(userJson: string): string | null {
  let user: unknown;
  try {
    user = JSON.parse(userJson);
  } catch {
    return null;
  }
  if (typeof user !== "object" || user === null || !Object.hasOwn(user, "id")) return null;
  const id: unknown = (user as { id: unknown }).id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  const asString = String(id);
  return platformUid("telegram", asString) === null ? null : asString;
}

/**
 * Verify raw initData for the bot `botToken` at server time `nowSeconds`.
 * The hash is checked before any signed field is trusted.
 */
export function verifyTelegramInitData(initData: unknown, botToken: string, nowSeconds: number): InitDataCheck {
  if (typeof initData !== "string" || initData.length === 0) return { ok: false, refusal: "MISSING" };
  if (initData.length > MAX_INIT_DATA_LENGTH) return { ok: false, refusal: "MALFORMED" };

  const fields = parseFields(initData);
  if (fields === null) return { ok: false, refusal: "MALFORMED" };
  const hash = fields.get("hash");
  if (hash === undefined || !HASH_HEX.test(hash)) return { ok: false, refusal: "MALFORMED" };

  const expected = initDataHash(dataCheckString(fields), botToken);
  if (!constantTimeEqual(expected, hash)) return { ok: false, refusal: "BAD_HASH" };

  const authDateRaw = fields.get("auth_date");
  if (authDateRaw === undefined || !UNIX_SECONDS.test(authDateRaw)) return { ok: false, refusal: "MALFORMED" };
  const authDate = Number(authDateRaw);
  if (nowSeconds - authDate > INIT_DATA_MAX_AGE_SECONDS) return { ok: false, refusal: "EXPIRED" };
  if (authDate - nowSeconds > INIT_DATA_FUTURE_SKEW_SECONDS) return { ok: false, refusal: "FUTURE" };

  const userJson = fields.get("user");
  if (userJson === undefined) return { ok: false, refusal: "NO_USER" };
  const telegramUserId = userIdOf(userJson);
  if (telegramUserId === null) return { ok: false, refusal: "BAD_USER" };

  return { ok: true, telegramUserId, authDate };
}
