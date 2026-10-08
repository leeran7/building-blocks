/**
 * Telegram fixtures for the tests in this folder.
 *
 * `signInitData` signs launch data the way Telegram does, written from
 * Telegram's spec ("Validating data received via the Mini App") rather than
 * from src/api/telegramInitData.ts, so a mistake in the production verifier
 * (the key and message of the WebAppData HMAC swapped, a field left out of
 * the data-check-string) makes the valid-fixture tests fail instead of
 * agreeing with it.
 */

import { createHmac } from "node:crypto";

export const TEST_BOT_TOKEN = "123456:TEST-bot-token-for-unit-tests";
export const OTHER_BOT_TOKEN = "654321:another-bot-entirely";
export const WEBHOOK_SECRET = "webhook-secret-for-unit-tests_0123456789";

export const TG_USER_ID = 987654321;
export const NOW = 1_760_000_000;

/** A Telegram `user` object as the client sends it. */
export function userJson(id: unknown = TG_USER_ID): string {
  return JSON.stringify({ id, first_name: "Ada", username: "ada", language_code: "en", allows_write_to_pm: true });
}

/** initData fields, signed per Telegram's spec with `token`. Values are raw (URL-encoded on output). */
export function signInitData(fields: Record<string, string>, token = TEST_BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** A complete, valid launch for TG_USER_ID at NOW. */
export function validFields(over: Record<string, string> = {}): Record<string, string> {
  return {
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: userJson(),
    auth_date: String(NOW - 60),
    signature: "c2lnbmF0dXJlLWZvci1lZDI1NTE5LXRoaXJkLXBhcnR5LXZhbGlkYXRpb24",
    ...over,
  };
}
