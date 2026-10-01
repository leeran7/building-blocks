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
 * App Store prices carry Apple's 30% (src/lib/gemPacks.ts), so the iOS Shop
 * also offers each pack at its web price through Stripe where Apple allows a
 * link out: the US storefront, while the server's `webCheckout` is on.
 */

export interface ShopState {
  gems: number;
  ownedIds: string[];
  /** The UUID the App Store purchase must carry (GET /api/shop). */
  appleAccountToken: string | null;
  /** The server allows iOS to link out to web checkout (GET /api/shop). */
  webCheckout: boolean;
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
  const o = v as { gems?: unknown; ownedIds?: unknown; appleAccountToken?: unknown; webCheckout?: unknown };
  if (typeof o.gems !== "number" || !Array.isArray(o.ownedIds)) return null;
  return {
    gems: o.gems,
    ownedIds: o.ownedIds.filter((id): id is string => typeof id === "string"),
    appleAccountToken: typeof o.appleAccountToken === "string" ? o.appleAccountToken : null,
    webCheckout: o.webCheckout === true,
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

/** A pack's price to show: the App Store's on iOS (its local price when known), else the web USD price. */
export function packPrice(pack: GemPack, storePrices: Record<string, string>): string {
  if (!usesAppStore()) return formatUsd(pack.usdCents);
  return storePrices[pack.id] ?? formatUsd(pack.appleUsdCents);
}

/**
 * True when the iOS Shop may offer web checkout next to the App Store: the
 * server allows it and the player's App Store account is in the US, where
 * Apple must let apps link to outside payment. False off iOS (web checkout is
 * already the only way there) and whenever the storefront can't be read.
 */
export async function offersWebCheckout(shop: ShopState): Promise<boolean> {
  if (!usesAppStore() || !shop.webCheckout) return false;
  try {
    const { countryCode } = await NativePurchases.getStorefront();
    return countryCode === "USA";
  } catch {
    return false;
  }
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

/** Buy a gem pack at its web price: Stripe Checkout in the browser. Throws ShopError on failure. */
export async function buyGemPackOnWeb(pack: GemPack): Promise<PackPurchaseResult> {
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

/** Buy one gem pack on this platform. Throws ShopError on failure. */
export async function buyGemPack(pack: GemPack, shop: ShopState): Promise<PackPurchaseResult> {
  if (!usesAppStore()) return buyGemPackOnWeb(pack);
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
    if (isPending(err)) {
      // Ask to Buy: the approved transaction arrives later (watchAppleTransactions).
      throw new ShopError("Waiting for approval. Your gems arrive once the purchase is approved.", "PENDING");
    }
    if (isMissingProduct(err)) {
      // StoreKit has no such product for this build: not created, not cleared
      // for sale, or the Paid Apps agreement isn't active in App Store Connect.
      throw new ShopError("This gem pack isn't available on the App Store yet.", "UNAVAILABLE");
    }
    // Keep StoreKit's own reason: the generic line alone can't be diagnosed.
    throw new ShopError(`The App Store couldn't complete the purchase (${storeReason(err)}).`, null);
  }
  if (!transaction.jwsRepresentation) {
    throw new ShopError("The App Store didn't return a receipt. Reopen the Shop to retry.", null);
  }
  const gems = await settleAppleTransaction(transaction.jwsRepresentation);
  // Credited (or already credited): only now tell StoreKit we're done.
  await finish(transaction.transactionId);
  return { kind: "credited", gems };
}

/** The plugin's "Cannot find product for id …" / "Product not found" rejections. */
function isMissingProduct(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /cannot find product|product not found/i.test(msg);
}

/** StoreKit's reason, short enough for the error line. */
function storeReason(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).trim();
  if (msg === "") return "no reason given";
  return msg.length > 80 ? `${msg.slice(0, 79)}…` : msg;
}

function isPending(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pending/i.test(msg);
}

function finish(transactionId: string): Promise<void> {
  return NativePurchases.acknowledgePurchase({ purchaseToken: transactionId }).catch(() => undefined);
}

/**
 * Server refusals that no retry can change (bad signature, not our app or a
 * gem pack, refunded, a test purchase). The transaction is finished so it
 * stops coming back; the server has logged it for support. WRONG_ACCOUNT is
 * not here: another account on this device may still settle it.
 */
export const FINAL_REFUSALS: ReadonlySet<string> = new Set([
  "INVALID_SIGNATURE",
  "WRONG_APP",
  "UNKNOWN_PRODUCT",
  "REVOKED",
  "BAD_QUANTITY",
  "SANDBOX",
]);

const GEM_PRODUCT_IDS: ReadonlySet<string> = new Set(GEM_PACKS.map((p) => p.appleProductId));

interface StoreTransaction {
  transactionId: string;
  productIdentifier: string;
  jwsRepresentation?: string;
}

/**
 * Credit one App Store transaction and finish it once the server has it.
 * Returns the new balance, or null when it is not a gem pack, the server
 * refused it for good (finished anyway), or it failed and stays unfinished
 * for the next try.
 */
export async function settleStoreTransaction(t: StoreTransaction): Promise<number | null> {
  if (!GEM_PRODUCT_IDS.has(t.productIdentifier) || !t.jwsRepresentation) return null;
  try {
    const gems = await settleAppleTransaction(t.jwsRepresentation);
    await finish(t.transactionId);
    return gems;
  } catch (err) {
    if (err instanceof ShopError && err.code !== null && FINAL_REFUSALS.has(err.code)) await finish(t.transactionId);
    return null;
  }
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
      // StoreKit compares against UUID.uuidString, which is upper-case.
      appAccountToken: shop.appleAccountToken.toUpperCase(),
    }));
  } catch {
    return null;
  }
  let latest: number | null = null;
  for (const p of purchases) {
    const gems = await settleStoreTransaction(p);
    if (gems !== null) latest = gems;
  }
  return latest;
}

/**
 * Credit gem packs StoreKit delivers while the app runs (an Ask to Buy
 * approval, a purchase finishing on another screen). Returns a stop function.
 */
export function watchAppleTransactions(onCredited: (gems: number) => void): () => void {
  if (!usesAppStore()) return () => undefined;
  let stopped = false;
  const handle = NativePurchases.addListener("transactionUpdated", (t) => {
    void settleStoreTransaction(t).then((gems) => {
      if (gems !== null && !stopped) onCredited(gems);
    });
  });
  return () => {
    stopped = true;
    void handle.then((h) => h.remove()).catch(() => undefined);
  };
}
