/**
 * Verify an App Store signed transaction (StoreKit 2 `jwsRepresentation`)
 * without calling Apple: the JWS carries its certificate chain in the x5c
 * header, and the chain must end at Apple Root CA - G3 (pinned below by its
 * SHA-256 fingerprint, as Apple's own server libraries do). Then the leaf's
 * key must have signed the payload.
 *
 * Checks, all required:
 *  - alg is ES256 and x5c holds exactly leaf, intermediate, root;
 *  - every certificate is inside its validity window;
 *  - leaf is issued and signed by the intermediate, the intermediate by the
 *    root, and the root is self-signed with the pinned fingerprint;
 *  - the leaf and intermediate carry Apple's App Store receipt-signing
 *    extension OIDs (1.2.840.113635.100.6.11.1 and 1.2.840.113635.100.6.2.1);
 *  - the ES256 signature over header.payload verifies with the leaf key.
 *
 * What the transaction is for (bundle, product, account, revocation) is the
 * caller's to check on the decoded payload.
 */

import { X509Certificate, verify as verifySignature } from "crypto";

/** SHA-256 fingerprint of Apple Root CA - G3 (https://www.apple.com/certificateauthority/). */
export const APPLE_ROOT_CA_G3_SHA256 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

/** DER of OID 1.2.840.113635.100.6.11.1, on Apple's App Store receipt-signing leaf. */
const LEAF_OID = Buffer.from("060a2a864886f76364060b01", "hex");
/** DER of OID 1.2.840.113635.100.6.2.1, on Apple's WWDR intermediate. */
const INTERMEDIATE_OID = Buffer.from("060a2a864886f76364060201", "hex");

/** The fields of a JWSTransactionDecodedPayload this app reads. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId?: string;
  bundleId: string;
  productId: string;
  /** "Consumable", "Non-Consumable", ... */
  type?: string;
  quantity?: number;
  /** "Sandbox" or "Production". */
  environment?: string;
  /** The UUID the app passed at purchase, lower-case. */
  appAccountToken?: string;
  /** Set (epoch ms) when Apple refunded or revoked the purchase. */
  revocationDate?: number;
  purchaseDate?: number;
}

export class AppleJwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleJwsError";
  }
}

export interface VerifyOptions {
  /** Pinned root fingerprint; tests pass their own. Defaults to Apple Root CA - G3. */
  rootFingerprint256?: string;
  /** Validity instant for the chain. Defaults to now. */
  now?: Date;
}

function b64urlJson(part: string, what: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AppleJwsError(`Malformed JWS ${what}`);
  }
}

function certOf(b64: unknown): X509Certificate {
  if (typeof b64 !== "string" || b64.length === 0) throw new AppleJwsError("Malformed x5c entry");
  try {
    return new X509Certificate(Buffer.from(b64, "base64"));
  } catch {
    throw new AppleJwsError("Malformed x5c certificate");
  }
}

function within(cert: X509Certificate, now: Date): boolean {
  return new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);
}

/** Verify the JWS and return its decoded transaction. Throws AppleJwsError. */
export function verifyAppleTransaction(jws: unknown, opts: VerifyOptions = {}): AppleTransaction {
  if (typeof jws !== "string") throw new AppleJwsError("JWS must be a string");
  const parts = jws.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new AppleJwsError("Malformed JWS");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = b64urlJson(headerPart, "header");
  if (header.alg !== "ES256") throw new AppleJwsError("Unexpected JWS algorithm");
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new AppleJwsError("Unexpected certificate chain");
  const [leaf, intermediate, root] = header.x5c.map(certOf);

  const now = opts.now ?? new Date();
  if (![leaf, intermediate, root].every((c) => within(c, now))) throw new AppleJwsError("Certificate out of date");
  if (root.fingerprint256 !== (opts.rootFingerprint256 ?? APPLE_ROOT_CA_G3_SHA256)) {
    throw new AppleJwsError("Chain does not end at the Apple root");
  }
  const chained =
    root.checkIssued(root) &&
    root.verify(root.publicKey) &&
    intermediate.checkIssued(root) &&
    intermediate.verify(root.publicKey) &&
    leaf.checkIssued(intermediate) &&
    leaf.verify(intermediate.publicKey);
  if (!chained) throw new AppleJwsError("Broken certificate chain");
  if (!leaf.raw.includes(LEAF_OID) || !intermediate.raw.includes(INTERMEDIATE_OID)) {
    throw new AppleJwsError("Not an App Store signing certificate");
  }

  const signature = Buffer.from(signaturePart, "base64url");
  const signed = verifySignature(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    signature
  );
  if (!signed) throw new AppleJwsError("Bad JWS signature");

  const payload = b64urlJson(payloadPart, "payload");
  const str = (k: string): string | undefined => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);
  const num = (k: string): number | undefined => (typeof payload[k] === "number" ? (payload[k] as number) : undefined);
  const transactionId = str("transactionId");
  const bundleId = str("bundleId");
  const productId = str("productId");
  if (!transactionId || !bundleId || !productId) throw new AppleJwsError("Transaction is missing fields");
  return {
    transactionId,
    originalTransactionId: str("originalTransactionId"),
    bundleId,
    productId,
    type: str("type"),
    quantity: num("quantity"),
    environment: str("environment"),
    appAccountToken: str("appAccountToken")?.toLowerCase(),
    revocationDate: num("revocationDate"),
    purchaseDate: num("purchaseDate"),
  };
}
