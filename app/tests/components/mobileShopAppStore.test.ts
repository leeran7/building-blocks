/**
 * App Store gem-pack settling in mobile/src/lib/shop.ts, with StoreKit (the
 * @capgo/native-purchases plugin) and the API mocked:
 *  - a transaction is finished only after the server credits it, or refuses
 *    it for good; a failed or WRONG_ACCOUNT post leaves it for the next try;
 *  - recovery asks StoreKit for this account's purchases with the token in
 *    upper case, the form StoreKit compares (UUID.uuidString);
 *  - an Ask to Buy approval delivered while the app runs is credited.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { plugin, apiFetch, listeners } = vi.hoisted(() => {
  const listeners: Array<(t: unknown) => void> = [];
  return {
    listeners,
    plugin: {
      getPurchases: vi.fn(),
      acknowledgePurchase: vi.fn(async () => {}),
      purchaseProduct: vi.fn(),
      getStorefront: vi.fn(),
      addListener: vi.fn(async (_event: string, fn: (t: unknown) => void) => {
        listeners.push(fn);
        return { remove: vi.fn(async () => {}) };
      }),
    },
    apiFetch: vi.fn(),
  };
});

vi.mock("@capgo/native-purchases", () => ({ NativePurchases: plugin, PURCHASE_TYPE: { INAPP: "inapp" } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios" } }));
vi.mock("../../mobile/src/lib/api", () => ({ apiFetch, isNative: true }));
vi.mock("../../mobile/src/lib/external", () => ({ openExternal: vi.fn(async () => {}) }));

import { openExternal } from "../../mobile/src/lib/external";

import {
  buyGemPack,
  buyGemPackOnWeb,
  offersWebCheckout,
  packPrice,
  settleStoreTransaction,
  settleUnfinishedPurchases,
  ShopError,
  watchAppleTransactions,
} from "../../mobile/src/lib/shop";
import { GEM_PACKS } from "../../src/lib/gemPacks";

const PACK = GEM_PACKS[1];
const TOKEN = "0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d";
const SHOP = { gems: 0, ownedIds: [], appleAccountToken: TOKEN, webCheckout: true };
const tx = (id: string, productIdentifier = PACK.appleProductId) => ({
  transactionId: id,
  productIdentifier,
  jwsRepresentation: `jws-${id}`,
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  listeners.length = 0;
});

describe("settleStoreTransaction", () => {
  it("posts the signed transaction and finishes it only after the server credits it", async () => {
    apiFetch.mockResolvedValue(json(200, { outcome: "credited", gems: 1200, packId: PACK.id }));
    expect(await settleStoreTransaction(tx("1"))).toBe(1200);
    expect(apiFetch).toHaveBeenCalledWith("/api/gems/apple", expect.objectContaining({ body: JSON.stringify({ jws: "jws-1" }) }));
    expect(plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: "1" });
  });

  it("leaves the transaction unfinished when the server fails, so it is retried", async () => {
    apiFetch.mockResolvedValue(json(500, { error: "db down" }));
    expect(await settleStoreTransaction(tx("1"))).toBeNull();
    apiFetch.mockRejectedValue(new Error("offline"));
    expect(await settleStoreTransaction(tx("1"))).toBeNull();
    expect(plugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it("leaves a WRONG_ACCOUNT refusal unfinished for the account that bought it", async () => {
    apiFetch.mockResolvedValue(json(400, { error: "other account", code: "WRONG_ACCOUNT" }));
    expect(await settleStoreTransaction(tx("1"))).toBeNull();
    expect(plugin.acknowledgePurchase).not.toHaveBeenCalled();
  });

  it.each(["REVOKED", "SANDBOX", "INVALID_SIGNATURE"])("finishes a transaction refused for good (%s)", async (code) => {
    apiFetch.mockResolvedValue(json(400, { error: "no", code }));
    expect(await settleStoreTransaction(tx("1"))).toBeNull();
    expect(plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: "1" });
  });

  it("ignores a product that is not a gem pack", async () => {
    expect(await settleStoreTransaction(tx("1", "lol.doomstack.app.something"))).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(plugin.acknowledgePurchase).not.toHaveBeenCalled();
  });
});

describe("settleUnfinishedPurchases", () => {
  it("asks StoreKit with the upper-case token and credits each unfinished pack", async () => {
    plugin.getPurchases.mockResolvedValue({ purchases: [tx("1"), tx("2")] });
    apiFetch
      .mockResolvedValueOnce(json(200, { outcome: "credited", gems: 1200 }))
      .mockResolvedValueOnce(json(200, { outcome: "credited", gems: 2400 }));
    expect(await settleUnfinishedPurchases(SHOP)).toBe(2400);
    expect(plugin.getPurchases).toHaveBeenCalledWith({ productType: "inapp", appAccountToken: TOKEN.toUpperCase() });
    expect(plugin.acknowledgePurchase).toHaveBeenCalledTimes(2);
  });
});

describe("watchAppleTransactions", () => {
  it("credits a gem pack StoreKit delivers later and reports the balance", async () => {
    apiFetch.mockResolvedValue(json(200, { outcome: "credited", gems: 1200 }));
    const onCredited = vi.fn();
    watchAppleTransactions(onCredited);
    expect(plugin.addListener).toHaveBeenCalledWith("transactionUpdated", expect.any(Function));
    listeners[0](tx("9"));
    await vi.waitFor(() => expect(onCredited).toHaveBeenCalledWith(1200));
    expect(plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: "9" });
  });

  it("stops reporting once stopped", async () => {
    apiFetch.mockResolvedValue(json(200, { outcome: "credited", gems: 1200 }));
    const onCredited = vi.fn();
    const stop = watchAppleTransactions(onCredited);
    stop();
    listeners[0](tx("9"));
    await vi.waitFor(() => expect(plugin.acknowledgePurchase).toHaveBeenCalled());
    expect(onCredited).not.toHaveBeenCalled();
  });
});

describe("buyGemPack on iOS", () => {
  it("reports an Ask to Buy purchase as waiting for approval", async () => {
    plugin.purchaseProduct.mockRejectedValue(new Error("Transaction pending"));
    const err = await buyGemPack(PACK, SHOP).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShopError);
    expect((err as ShopError).code).toBe("PENDING");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("paying outside the App Store", () => {
  it("offers web checkout only on the US storefront while the server allows it", async () => {
    plugin.getStorefront.mockResolvedValue({ countryCode: "USA" });
    expect(await offersWebCheckout(SHOP)).toBe(true);
    expect(await offersWebCheckout({ ...SHOP, webCheckout: false })).toBe(false);
    for (const countryCode of ["GBR", "US", ""]) {
      plugin.getStorefront.mockResolvedValue({ countryCode });
      expect(await offersWebCheckout(SHOP)).toBe(false);
    }
    plugin.getStorefront.mockRejectedValue(new Error("no storefront"));
    expect(await offersWebCheckout(SHOP)).toBe(false);
  });

  it("opens Stripe Checkout at the web price instead of the App Store", async () => {
    apiFetch.mockResolvedValue(json(200, { checkoutUrl: "https://checkout.stripe.com/c/1" }));
    expect(await buyGemPackOnWeb(PACK)).toEqual({ kind: "checkout" });
    expect(apiFetch).toHaveBeenCalledWith("/api/gems/checkout", expect.objectContaining({ body: JSON.stringify({ packId: PACK.id }) }));
    expect(openExternal).toHaveBeenCalledWith("https://checkout.stripe.com/c/1");
    expect(plugin.purchaseProduct).not.toHaveBeenCalled();
  });

  it("shows the marked-up App Store price on iOS until the store's own price loads", () => {
    expect(packPrice(PACK, {})).toBe("$12.99");
    expect(packPrice(PACK, { [PACK.id]: "12,99 €" })).toBe("12,99 €");
  });
});
