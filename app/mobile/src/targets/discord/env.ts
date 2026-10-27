/// <reference path="./env.d.ts" />
/**
 * Build-time settings for the Discord Activity (Vite env, public values only).
 *
 *  - VITE_DISCORD_CLIENT_ID: the Discord application id (same as the server's
 *    DISCORD_CLIENT_ID).
 *  - VITE_DISCORD_GEM_SKUS: the same JSON as the server's DISCORD_GEM_SKUS,
 *    {"<sku_id>": "<pack id>"}; the client only uses it to pick which SKU to
 *    sell for a pack. The server never trusts it.
 */

import { isSnowflake, parseGemSkuTable, type GemSkuTable } from "@app/api/discordSkus";

/** The Discord application id, or null when the build has none (or a malformed one). */
export function discordClientId(raw: unknown = import.meta.env.VITE_DISCORD_CLIENT_ID): string | null {
  return isSnowflake(raw) ? raw : null;
}

/** The SKU table this build sells from. */
export function clientGemSkus(raw: unknown = import.meta.env.VITE_DISCORD_GEM_SKUS): GemSkuTable {
  return parseGemSkuTable(typeof raw === "string" ? raw : null);
}
