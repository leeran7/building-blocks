/**
 * App Store gem packs: turn a StoreKit 2 signed transaction into gems.
 *
 * The app buys a pack with `appAccountToken` = appleAccountTokenFor(uid), the
 * token GET /api/shop hands it, and posts the transaction's
 * `jwsRepresentation` to POST /api/gems/apple. Credit happens only when:
 *  - the JWS verifies against Apple's root (appleJws.ts);
 *  - it is for this app (APPLE_BUNDLE_ID) and one of our gem-pack products;
 *  - it was bought by this account (the appAccountToken matches);
 *  - it has not been refunded or revoked, and is for exactly one pack;
 *  - it is a real purchase (environment "Production"). Sandbox and TestFlight
 *    purchases cost nothing, so they credit only for the uids listed in
 *    APPLE_IAP_SANDBOX_UIDS (App Review's demo account, our own testers).
 * Crediting is idempotent on the App Store transaction id (creditGemPack), so
 * a retried post, or the same JWS from another account, never credits twice.
 */

import { createHash } from "crypto";
import { verifyAppleTransaction, type AppleTransaction, type VerifyOptions } from "./appleJws";
import { gemPackByAppleProduct, type GemPack } from "../lib/gemPacks";

/** The iOS app's bundle id (capacitor.config.ts appId). */
export const DEFAULT_APPLE_BUNDLE_ID = "lol.doomstack.app";

/** A fixed namespace for account tokens, so one uid always maps to one UUID. */
const TOKEN_NAMESPACE = Buffer.from("6f1d0f3c9b7a4e5d8a2c41b7e0d9f3a5", "hex");

/**
 * The UUID (v5 layout, SHA-1 over a fixed namespace and the uid) this account
 * buys App Store packs with. Not a secret: it only binds a transaction to the
 * account that started it.
 */
export function appleAccountTokenFor(uid: string): string {
  const h = createHash("sha1").update(TOKEN_NAMESPACE).update(uid, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type AppleRefusal =
  | "INVALID_SIGNATURE"
  | "WRONG_APP"
  | "UNKNOWN_PRODUCT"
  | "WRONG_ACCOUNT"
  | "REVOKED"
  | "BAD_QUANTITY"
  | "SANDBOX";

/** Uids allowed to credit Sandbox transactions: APPLE_IAP_SANDBOX_UIDS, comma-separated. */
function sandboxUids(): string[] {
  return (process.env.APPLE_IAP_SANDBOX_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type AppleCheck =
  | { ok: true; transaction: AppleTransaction; pack: GemPack }
  | { ok: false; refusal: AppleRefusal; transactionId: string | null };

/** Verify `jws` for `uid` and resolve the pack it buys. Never throws. */
export function checkAppleGemTransaction(
  jws: unknown,
  uid: string,
  opts: VerifyOptions & { bundleId?: string; sandboxUids?: readonly string[] } = {}
): AppleCheck {
  let t: AppleTransaction;
  try {
    t = verifyAppleTransaction(jws, opts);
  } catch {
    return { ok: false, refusal: "INVALID_SIGNATURE", transactionId: null };
  }
  const refuse = (refusal: AppleRefusal): AppleCheck => ({ ok: false, refusal, transactionId: t.transactionId });
  if (t.bundleId !== (opts.bundleId ?? process.env.APPLE_BUNDLE_ID ?? DEFAULT_APPLE_BUNDLE_ID)) {
    return refuse("WRONG_APP");
  }
  const pack = gemPackByAppleProduct(t.productId);
  if (pack === null) return refuse("UNKNOWN_PRODUCT");
  if (t.appAccountToken !== appleAccountTokenFor(uid)) return refuse("WRONG_ACCOUNT");
  if (t.revocationDate !== undefined) return refuse("REVOKED");
  if ((t.quantity ?? 1) !== 1) return refuse("BAD_QUANTITY");
  if (t.environment !== "Production") {
    const allowed = t.environment === "Sandbox" && (opts.sandboxUids ?? sandboxUids()).includes(uid);
    if (!allowed) return refuse("SANDBOX");
  }
  return { ok: true, transaction: t, pack };
}
