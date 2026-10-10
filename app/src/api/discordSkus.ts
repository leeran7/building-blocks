/**
 * Discord consumable SKU <-> gem pack table. Client-safe (no server imports):
 * the server settles entitlements from it (src/api/discordEntitlements.ts) and
 * the Discord build reads the same JSON to know which SKU to sell for a pack.
 *
 * Format, for both DISCORD_GEM_SKUS (server) and VITE_DISCORD_GEM_SKUS (client):
 *   {"<sku_id>": "<pack id>", ...}   e.g. {"1290000000000000001": "gems-500"}
 *
 * Parsed allow-list style: a key that is not a snowflake or a value that is not
 * a pack id in src/lib/gemPacks.ts is dropped, never coerced. What a pack
 * credits still comes from GEM_PACKS, never from this table or a request.
 */

import { gemPackById, type GemPack } from "../lib/gemPacks";

/** Discord ids (snowflakes) are positive integers of at most 20 digits. */
const SNOWFLAKE = /^[1-9][0-9]{0,19}$/;

export function isSnowflake(v: unknown): v is string {
  return typeof v === "string" && SNOWFLAKE.test(v);
}

/** SKU id -> pack. A null-prototype record: read it only through packForSku. */
export type GemSkuTable = Readonly<Record<string, GemPack>>;

/** Parse the SKU table JSON. Anything malformed yields an empty table. */
export function parseGemSkuTable(raw: string | undefined | null): GemSkuTable {
  const table: Record<string, GemPack> = Object.create(null) as Record<string, GemPack>;
  if (!raw) return table;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return table;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return table;
  for (const [skuId, packId] of Object.entries(parsed as Record<string, unknown>)) {
    const pack = gemPackById(packId);
    if (isSnowflake(skuId) && pack) table[skuId] = pack;
  }
  return table;
}

/** The pack sold as Discord SKU `skuId`, or null for anything not in the table. */
export function packForSku(table: GemSkuTable, skuId: unknown): GemPack | null {
  if (typeof skuId !== "string" || !Object.prototype.hasOwnProperty.call(table, skuId)) return null;
  return table[skuId] ?? null;
}

/** The SKU that sells pack `packId` (the first one listed), or null when none does. */
export function skuForPack(table: GemSkuTable, packId: string): string | null {
  for (const skuId of Object.keys(table)) {
    if (table[skuId]?.id === packId) return skuId;
  }
  return null;
}
