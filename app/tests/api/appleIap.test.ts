/**
 * App Store gem packs: verifyAppleTransaction (src/api/appleJws.ts) and
 * checkAppleGemTransaction (src/api/appleIap.ts), against a throwaway
 * certificate chain in tests/fixtures/appleJws that mirrors Apple's (root,
 * WWDR intermediate with OID 1.2.840.113635.100.6.2.1, leaf with
 * 1.2.840.113635.100.6.11.1). The production pin is Apple Root CA - G3, so
 * every fixture JWS is signed for real and verified with the test root's
 * fingerprint; the same JWS against the default pin must fail.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { X509Certificate, createPrivateKey, sign } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { AppleJwsError, verifyAppleTransaction } from "../../src/api/appleJws";
import { appleAccountTokenFor, checkAppleGemTransaction, DEFAULT_APPLE_BUNDLE_ID } from "../../src/api/appleIap";
import { GEM_PACKS } from "../../src/lib/gemPacks";

const DIR = join(__dirname, "../fixtures/appleJws");
const pem = (f: string) => readFileSync(join(DIR, f), "utf8");
const der = (p: string) => new X509Certificate(p).raw.toString("base64");
const ROOT = pem("root.pem");
const INTER = pem("inter.pem");
const LEAF = pem("leaf.pem");
const LEAF_NO_OID = pem("leaf-no-oid.pem");
const INTER_NOT_CA = pem("inter-not-ca.pem");
const LEAF_KEY = createPrivateKey(pem("leaf.key"));
const ROOT_FP = new X509Certificate(ROOT).fingerprint256;
const opts = { rootFingerprint256: ROOT_FP };

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function jws(
  payload: Record<string, unknown>,
  { chain = [LEAF, INTER, ROOT], alg = "ES256" }: { chain?: string[]; alg?: string } = {}
): string {
  const head = b64url({ alg, x5c: chain.map(der) });
  const body = b64url(payload);
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: LEAF_KEY, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

const UID = "firebase-uid-1";
const PACK = GEM_PACKS[1];
const tx = (over: Record<string, unknown> = {}) => ({
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123456789",
  bundleId: DEFAULT_APPLE_BUNDLE_ID,
  productId: PACK.appleProductId,
  type: "Consumable",
  quantity: 1,
  environment: "Production",
  appAccountToken: appleAccountTokenFor(UID),
  purchaseDate: 1_790_000_000_000,
  ...over,
});

describe("verifyAppleTransaction", () => {
  it("decodes a JWS whose chain ends at the pinned root and whose leaf signed it", () => {
    const t = verifyAppleTransaction(jws(tx()), opts);
    expect(t).toMatchObject({
      transactionId: "2000000123456789",
      bundleId: DEFAULT_APPLE_BUNDLE_ID,
      productId: PACK.appleProductId,
      quantity: 1,
      appAccountToken: appleAccountTokenFor(UID),
    });
  });

  it("refuses the same JWS against the real Apple Root CA - G3 pin", () => {
    expect(() => verifyAppleTransaction(jws(tx()))).toThrow(/Apple root/);
  });

  it("refuses a payload changed after signing", () => {
    const [h, , s] = jws(tx()).split(".");
    const forged = `${h}.${b64url(tx({ productId: GEM_PACKS[3].appleProductId }))}.${s}`;
    expect(() => verifyAppleTransaction(forged, opts)).toThrow(/signature/);
  });

  it("refuses a chain that is short, out of order, or has a leaf without the App Store OID", () => {
    expect(() => verifyAppleTransaction(jws(tx(), { chain: [LEAF, ROOT] }), opts)).toThrow(AppleJwsError);
    expect(() => verifyAppleTransaction(jws(tx(), { chain: [INTER, LEAF, ROOT] }), opts)).toThrow(/chain/);
    expect(() => verifyAppleTransaction(jws(tx(), { chain: [LEAF_NO_OID, INTER, ROOT] }), opts)).toThrow(
      /App Store signing/
    );
    // Same key and name as the real intermediate, but not a CA.
    expect(() => verifyAppleTransaction(jws(tx(), { chain: [LEAF, INTER_NOT_CA, ROOT] }), opts)).toThrow(/chain/);
  });

  it("refuses any algorithm but ES256, and certificates outside their validity", () => {
    expect(() => verifyAppleTransaction(jws(tx(), { alg: "none" }), opts)).toThrow(/algorithm/);
    expect(() => verifyAppleTransaction(jws(tx()), { ...opts, now: new Date("2000-01-01") })).toThrow(/out of date/);
  });

  it.each([undefined, 7, "", "a.b", "a..c", "!!.!!.!!"])("refuses malformed input %j", (bad) => {
    expect(() => verifyAppleTransaction(bad, opts)).toThrow(AppleJwsError);
  });

  it("refuses a signed transaction missing its ids", () => {
    expect(() => verifyAppleTransaction(jws(tx({ transactionId: undefined })), opts)).toThrow(/missing/);
  });
});

describe("appleAccountTokenFor", () => {
  it("is a stable v5-layout UUID per uid, different across uids", () => {
    const a = appleAccountTokenFor(UID);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(appleAccountTokenFor(UID)).toBe(a);
    expect(appleAccountTokenFor("someone-else")).not.toBe(a);
  });
});

describe("checkAppleGemTransaction", () => {
  const check = (payload: Record<string, unknown>, uid = UID) => checkAppleGemTransaction(jws(payload), uid, opts);

  it("resolves this account's verified gem-pack purchase to the pack from the server table", () => {
    const r = check(tx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack).toBe(PACK);
  });

  it("credits a Sandbox purchase only for a uid on the sandbox list (App Review, testers)", () => {
    const r = checkAppleGemTransaction(jws(tx({ environment: "Sandbox" })), UID, { ...opts, sandboxUids: [UID] });
    expect(r.ok).toBe(true);
  });

  it("reads the sandbox list from APPLE_IAP_SANDBOX_UIDS", () => {
    const sandbox = jws(tx({ environment: "Sandbox" }));
    vi.stubEnv("APPLE_IAP_SANDBOX_UIDS", ` other , ${UID} `);
    try {
      expect(checkAppleGemTransaction(sandbox, UID, opts).ok).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(checkAppleGemTransaction(sandbox, UID, opts).ok).toBe(false);
  });

  it("accepts the account token in upper case (StoreKit may print it that way)", () => {
    expect(check(tx({ appAccountToken: appleAccountTokenFor(UID).toUpperCase() })).ok).toBe(true);
  });

  it.each([
    ["INVALID_SIGNATURE", () => checkAppleGemTransaction(jws(tx()), UID)],
    ["WRONG_APP", () => check(tx({ bundleId: "com.example.other" }))],
    ["UNKNOWN_PRODUCT", () => check(tx({ productId: "lol.doomstack.app.gems999999" }))],
    ["WRONG_ACCOUNT", () => check(tx(), "another-uid")],
    ["WRONG_ACCOUNT", () => check(tx({ appAccountToken: undefined }))],
    ["REVOKED", () => check(tx({ revocationDate: 1_790_000_100_000 }))],
    ["BAD_QUANTITY", () => check(tx({ quantity: 2 }))],
    ["SANDBOX", () => check(tx({ environment: "Sandbox" }))],
    ["SANDBOX", () => check(tx({ environment: "Xcode" }))],
    ["SANDBOX", () => check(tx({ environment: undefined }))],
    ["SANDBOX", () => checkAppleGemTransaction(jws(tx({ environment: "Sandbox" })), UID, { ...opts, sandboxUids: ["someone-else"] })],
    ["SANDBOX", () => checkAppleGemTransaction(jws(tx({ environment: "Xcode" })), UID, { ...opts, sandboxUids: [UID] })],
  ] as const)("refuses %s", (refusal, run) => {
    const r = run();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal).toBe(refusal);
  });
});
