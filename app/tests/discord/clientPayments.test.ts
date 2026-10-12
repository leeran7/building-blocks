/**
 * The Discord build's gem-pack payments adapter
 * (mobile/src/targets/discord/payments.ts) against a fake SDK and server.
 */

import { describe, expect, it, vi } from "vitest";
import { gemPackById } from "../../src/lib/gemPacks";
import { parseGemSkuTable } from "../../src/api/discordSkus";
import { ShopError } from "../../mobile/src/lib/shop";
import {
  createDiscordPayments,
  SETTLE_ATTEMPTS,
  type PurchaseSdk,
} from "../../mobile/src/targets/discord/payments";

const SKU_500 = "1300000000000000500";
const PACK_500 = gemPackById("gems-500")!;
const PACK_1200 = gemPackById("gems-1200")!;
const skus = parseGemSkuTable(JSON.stringify({ [SKU_500]: "gems-500" }));

type StartPurchase = PurchaseSdk["commands"]["startPurchase"];
type Entitlements = Awaited<ReturnType<StartPurchase>>;

const ENTITLEMENT = [{ id: "2000000000000000001", sku_id: SKU_500 }] as unknown as Entitlements;

function setup(opts: { purchase?: () => Promise<Entitlements>; settles?: Response[]; sdk?: boolean } = {}) {
  const startPurchase = vi.fn<StartPurchase>(opts.purchase ?? (async () => ENTITLEMENT));
  const getSkus = vi.fn(async () => ({
    skus: [
      { id: SKU_500, name: "500 gems", type: 3, flags: 0, application_id: "1", price: { amount: 399, currency: "eur" }, release_date: null },
      { id: "1300000000000009999", name: "other", type: 3, flags: 0, application_id: "1", price: { amount: 1, currency: "usd" }, release_date: null },
    ],
  })) as unknown as PurchaseSdk["commands"]["getSkus"];
  const sdk: PurchaseSdk = {
    commands: { startPurchase, getSkus },
    formatPrice: (p) => `${p.amount} ${p.currency}`,
  };
  const queue = [...(opts.settles ?? [])];
  const settle = vi.fn(async () => queue.shift() ?? Response.json({ gems: 0, credited: 0, duplicates: 0 }));
  const wait = vi.fn(async () => undefined);
  const payments = createDiscordPayments({ load: async () => (opts.sdk === false ? null : sdk), skus, settle, wait });
  return { payments, startPurchase, settle, wait };
}

describe("Discord payments", () => {
  it("buys the pack's SKU, then settles on the server and reports the new balance", async () => {
    const s = setup({ settles: [Response.json({ gems: 500, credited: 1, duplicates: 0 })] });
    expect(await s.payments.buyGemPack(PACK_500)).toEqual({ kind: "credited", gems: 500 });
    expect(s.startPurchase).toHaveBeenCalledWith({ sku_id: SKU_500 });
    expect(s.settle).toHaveBeenCalledTimes(1);
  });

  it("retries settling while Discord has not listed the new entitlement yet", async () => {
    const empty = () => Response.json({ gems: 0, credited: 0, duplicates: 0 });
    const s = setup({ settles: [empty(), empty(), Response.json({ gems: 500, credited: 1, duplicates: 0 })] });
    expect(await s.payments.buyGemPack(PACK_500)).toEqual({ kind: "credited", gems: 500 });
    expect(s.settle).toHaveBeenCalledTimes(3);
    expect(s.wait).toHaveBeenCalledTimes(2);
  });

  it("says the gems are pending when a completed purchase never settles", async () => {
    const s = setup();
    const err = await s.payments.buyGemPack(PACK_500).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect((err as ShopError).code).toBe("PENDING");
    expect(s.settle).toHaveBeenCalledTimes(SETTLE_ATTEMPTS);
  });

  it("maps a closed purchase modal to cancelled (after one settle for anything already paid)", async () => {
    const s = setup({ purchase: async () => null });
    expect(await s.payments.buyGemPack(PACK_500)).toEqual({ kind: "cancelled" });
    expect(s.settle).toHaveBeenCalledTimes(1);

    const thrown = setup({ purchase: async () => Promise.reject(new Error("Purchase cancelled by user")) });
    expect(await thrown.payments.buyGemPack(PACK_500)).toEqual({ kind: "cancelled" });
  });

  it("still reports credited when the modal closed after the payment went through", async () => {
    const s = setup({ purchase: async () => null, settles: [Response.json({ gems: 500, credited: 1, duplicates: 0 })] });
    expect(await s.payments.buyGemPack(PACK_500)).toEqual({ kind: "credited", gems: 500 });
  });

  it("surfaces a Discord purchase error that is not a cancel", async () => {
    const s = setup({ purchase: async () => Promise.reject({ code: 4000, message: "Invalid SKU" }) });
    const err = await s.payments.buyGemPack(PACK_500).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect((err as ShopError).code).toBeNull();
  });

  it("refuses a pack with no SKU, and buying outside Discord, without opening a purchase", async () => {
    const s = setup();
    await expect(s.payments.buyGemPack(PACK_1200)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const outside = setup({ sdk: false });
    await expect(outside.payments.buyGemPack(PACK_500)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(s.startPurchase).not.toHaveBeenCalled();
  });

  it("shows Discord's price once loaded, else the pack's web price", async () => {
    const s = setup();
    expect(s.payments.packPrice(PACK_500)).toBe("$4.99");
    await s.payments.loadPrices();
    expect(s.payments.packPrice(PACK_500)).toBe("399 eur");
    expect(s.payments.packPrice(PACK_1200)).toBe("$9.99");
  });

  it("settlePending returns the balance only when something settled", async () => {
    const s = setup({ settles: [Response.json({ gems: 0, credited: 0, duplicates: 0 }), Response.json({ gems: 700, credited: 0, duplicates: 1 })] });
    expect(await s.payments.settlePending()).toBeNull();
    expect(await s.payments.settlePending()).toBe(700);
    const failing = setup({ settles: [new Response("{}", { status: 502 })] });
    expect(await failing.payments.settlePending()).toBeNull();
  });
});
