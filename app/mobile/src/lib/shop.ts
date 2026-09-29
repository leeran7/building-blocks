import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { GEM_PACKS, formatUsd, type GemPack } from "@app/lib/gemPacks";
import { apiFetch, isNative } from "./api";
import { openExternal } from "./external";

/**
 * Shop API client and gem-pack buying.
 *
 * Gems buy characters and skins (POST /api/shop/buy). Gem packs cost real
 * money and are bought per platform:
 *  - iOS: an App Store consumable (StoreKit 2 through @capgo/native-purchases),
 *    bought under the account's appAccountToken. The signed transaction goes
 *    to POST /api/gems/apple, and the transaction is finished only once the
 *    server has credited it (or already had), so a dropped response never
 *    loses a paid pack: StoreKit keeps it unfinished until the next try.
 *  - everywhere else: Stripe Checkout in the browser (POST /api/gems/checkout),
 *    credited by the Stripe webhook.
 */

export interface ShopState {
  gems: number;
  ownedIds: string[];
  /** The UUID the App Store purchase must carry (GET /api/shop). */
  appleAccountToken: string | null;
}

/** A refused Shop call: `code` is the server's (INSUFFICIENT_GEMS, OWNED, ...). */
export class ShopError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = "ShopError";
  }
}

async function errorOf(res: Response, fallback: string): Promise<ShopError> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  return new ShopError(
    typeof body.error === "string" ? body.error : fallback,
    typeof body.code === "string" ? body.code : null,
  );
}

function parseShop(v: unknown): ShopState | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as { gems?: unknown; ownedIds?: unknown; appleAccountToken?: unknown };
  if (typeof o.gems !== "number" || !Array.isArray(o.ownedIds)) return null;
  return {
    gems: o.gems,
    ownedIds: o.ownedIds.filter((id): id is string => typeof id === "string"),
    appleAccountToken: typeof o.appleAccountToken === "string" ? o.appleAccountToken : null,
  };
}

export async function fetchShop(): Promise<ShopState> {
  const res = await apiFetch("/api/shop");
  if (!res.ok) throw await errorOf(res, "Couldn't load the Shop.");
  const state = parseShop(await res.json().catch(() => null));
  if (!state) throw new ShopError("Couldn't load the Shop. Please update the app.", null);
  return state;
}

/** Buy a character or skin with gems. Resolves to the new gems and owned ids. */
export async function buyWithGems(avatarId: string): Promise<{ gems: number; ownedIds: string[] }> {
  const res = await apiFetch("/api/shop/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarId }),
  });
  if (!res.ok) throw await errorOf(res, "Couldn't complete the purchase. Try again.");
  const body = (await res.json().catch(() => null)) as { gems?: unknown; ownedIds?: unknown } | null;
  if (typeof body?.gems !== "number" || !Array.isArray(body.ownedIds)) {
    throw new ShopError("Couldn't complete the purchase. Try again.", null);
  }
  return { gems: body.gems, ownedIds: body.ownedIds.filter((id): id is string => typeof id === "string") };
}

/** True where gem packs are App Store purchases (the iOS app). */
export function usesAppStore(): boolean {
  return isNative && Capacitor.getPlatform() === "ios";
}

/** Store-formatted price per pack id on iOS ("$9.99", "9,99 €"); empty elsewhere or on failure. */
export async function appStorePrices(): Promise<Record<string, string>> {
  if (!usesAppStore()) return {};
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: GEM_PACKS.map((p) => p.appleProductId),
      productType: PURCHASE_TYPE.INAPP,
    });
    return Object.fromEntries(
      GEM_PACKS.flatMap((p) => {
        const product = products.find((x) => x.identifier === p.appleProductId);
        return product?.priceString ? [[p.id, product.priceString] as const] : [];
      }),
    );
  } catch {
    return {};
  }
}

/** A pack's price to show: the App Store's on iOS when known, else the web USD price. */
export function packPrice(pack: GemPack, storePrices: Record<string, string>): string {
  return storePrices[pack.id] ?? formatUsd(pack.usdCents);
}

export type PackPurchaseResult =
  /** Credited now; `gems` is the new balance. */
  | { kind: "credited"; gems: number }
  /** Handed to Stripe Checkout in the browser; gems arrive by webhook. */
  | { kind: "checkout" }
  /** The player backed out of the store sheet. */
  | { kind: "cancelled" };

function isCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(msg);
}

/** Post a signed App Store transaction for crediting. */
async function settleAppleTransaction(jws: string): Promise<number> {
  const res = await apiFetch("/api/gems/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws }),
  });
  if (!res.ok) throw await errorOf(res, "Your purchase went through but the gems didn't arrive yet. Reopen the Shop to retry.");
  const body = (await res.json().catch(() => null)) as { gems?: unknown } | null;
  if (typeof body?.gems !== "number") throw new ShopError("Couldn't add your gems. Reopen the Shop to retry.", null);
  return body.gems;
}

/** Buy one gem pack on this platform. Throws ShopError on failure. */
export async function buyGemPack(pack: GemPack, shop: ShopState): Promise<PackPurchaseResult> {
  if (!usesAppStore()) {
    const res = await apiFetch("/api/gems/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: pack.id }),
    });
    if (!res.ok) throw await errorOf(res, "Couldn't start checkout. Try again.");
    const body = (await res.json().catch(() => null)) as { checkoutUrl?: unknown } | null;
    if (typeof body?.checkoutUrl !== "string") throw new ShopError("Couldn't start checkout. Try again.", null);
    await openExternal(body.checkoutUrl);
    return { kind: "checkout" };
  }

  if (!shop.appleAccountToken) throw new ShopError("Couldn't reach the App Store. Try again.", null);
  let transaction;
  try {
    transaction = await NativePurchases.purchaseProduct({
      productIdentifier: pack.appleProductId,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      appAccountToken: shop.appleAccountToken,
      autoAcknowledgePurchases: false,
    });
  } catch (err) {
    if (isCancel(err)) return { kind: "cancelled" };
    throw new ShopError("The App Store couldn't complete the purchase.", null);
  }
  if (!transaction.jwsRepresentation) {
    throw new ShopError("The App Store didn't return a receipt. Reopen the Shop to retry.", null);
  }
  const gems = await settleAppleTransaction(transaction.jwsRepresentation);
  // Credited (or already credited): only now tell StoreKit we're done.
  await NativePurchases.acknowledgePurchase({ purchaseToken: transaction.transactionId }).catch(() => undefined);
  return { kind: "credited", gems };
}

/**
 * Settle App Store gem packs that were paid for but never finished (the app
 * closed, or the server was unreachable, after payment). Best-effort, on
 * opening the Shop. Returns the latest balance when anything was credited.
 */
export async function settleUnfinishedPurchases(shop: ShopState): Promise<number | null> {
  if (!usesAppStore() || !shop.appleAccountToken) return null;
  let purchases;
  try {
    ({ purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.INAPP,
      appAccountToken: shop.appleAccountToken,
    }));
  } catch {
    return null;
  }
  const packIds = new Set(GEM_PACKS.map((p) => p.appleProductId));
  let latest: number | null = null;
  for (const p of purchases) {
    if (!packIds.has(p.productIdentifier) || !p.jwsRepresentation || p.isAcknowledged === true) continue;
    try {
      latest = await settleAppleTransaction(p.jwsRepresentation);
      await NativePurchases.acknowledgePurchase({ purchaseToken: p.transactionId }).catch(() => undefined);
    } catch {
      /* stays unfinished; retried next time */
    }
  }
  return latest;
}
