/**
 * The Discord SKU -> gem pack table (src/api/discordSkus.ts): an allow-list
 * parser shared by the server (DISCORD_GEM_SKUS) and the Discord build
 * (VITE_DISCORD_GEM_SKUS).
 */

import { describe, expect, it } from "vitest";
import { packForSku, parseGemSkuTable, skuForPack } from "../../src/api/discordSkus";
import { gemPackById } from "../../src/lib/gemPacks";
import { clientGemSkus, discordClientId } from "../../mobile/src/targets/discord/env";

const SKU = "1300000000000000500";

describe("parseGemSkuTable", () => {
  it("maps snowflake SKU ids to packs from GEM_PACKS", () => {
    const table = parseGemSkuTable(JSON.stringify({ [SKU]: "gems-500", "1300000000000001200": "gems-1200" }));
    expect(packForSku(table, SKU)).toBe(gemPackById("gems-500"));
    expect(packForSku(table, "1300000000000001200")).toBe(gemPackById("gems-1200"));
  });

  it("drops unknown pack ids and non-snowflake keys instead of coercing them", () => {
    const table = parseGemSkuTable(
      JSON.stringify({ [SKU]: "gems-999999", abc: "gems-500", "0123": "gems-500", "1300000000000000001": 500 })
    );
    expect(Object.keys(table)).toEqual([]);
  });

  it.each([["not json", "{"], ["an array", "[]"], ["a string", '"x"'], ["null", "null"], ["empty", ""], ["unset", undefined]])(
    "is empty for %s",
    (_label, raw) => {
      expect(Object.keys(parseGemSkuTable(raw))).toEqual([]);
    }
  );

  it("never resolves inherited keys", () => {
    const table = parseGemSkuTable(JSON.stringify({ [SKU]: "gems-500" }));
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(packForSku(table, key)).toBeNull();
    }
    expect(packForSku(table, 1300000000000000500)).toBeNull();
  });

  it("finds the SKU that sells a pack", () => {
    const table = parseGemSkuTable(JSON.stringify({ [SKU]: "gems-500" }));
    expect(skuForPack(table, "gems-500")).toBe(SKU);
    expect(skuForPack(table, "gems-1200")).toBeNull();
  });
});

describe("Discord build env", () => {
  it("accepts only a snowflake client id", () => {
    expect(discordClientId("1290000000000000000")).toBe("1290000000000000000");
    expect(discordClientId("")).toBeNull();
    expect(discordClientId("abc")).toBeNull();
    expect(discordClientId(undefined)).toBeNull();
  });

  it("reads the client SKU table with the same allow-list", () => {
    const table = clientGemSkus(JSON.stringify({ [SKU]: "gems-500", bad: "gems-500" }));
    expect(Object.keys(table)).toEqual([SKU]);
    expect(Object.keys(clientGemSkus(42))).toEqual([]);
  });
});
