/**
 * Telegram Stars settlement rules, as units:
 *  - the Stars price table (src/api/telegramStars.ts) prices every pack;
 *  - the invoice payload (src/api/telegramPayload.ts) cannot be forged or
 *    moved to another account or pack;
 *  - checkStarsPayment (src/api/telegramPayments.ts) refuses any claim that
 *    is not exactly what the server invoiced, to the account it invoiced.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/firebaseAdmin", () => ({ adminAuth: {} }));
vi.mock("../../src/db/user", () => ({ ensurePlatformUser: vi.fn() }));

import { GEM_PACKS, gemPackById, type GemPack } from "../../src/lib/gemPacks";
import { formatStars, starsForUsdCents, starsPrice } from "../../src/api/telegramStars";
import {
  MAX_PAYLOAD_BYTES,
  signInvoicePayload,
  telegramIdOfUid,
  verifyInvoicePayload,
} from "../../src/api/telegramPayload";
import { checkStarsPayment, parseTelegramUpdate } from "../../src/api/telegramPayments";
import { OTHER_BOT_TOKEN, TEST_BOT_TOKEN, TG_USER_ID } from "./fixtures";

const UID = `telegram:${TG_USER_ID}`;
const PACK = gemPackById("gems-1200")!;

describe("Stars prices", () => {
  it("prices every pack, from its web price at about $0.013 per Star", () => {
    for (const pack of GEM_PACKS) {
      const stars = starsPrice(pack);
      expect(stars, pack.id).not.toBeNull();
      expect(Math.abs(stars! - pack.usdCents / 1.3) / (pack.usdCents / 1.3), pack.id).toBeLessThan(0.05);
      expect(stars! % 25, pack.id).toBe(0);
    }
    expect(GEM_PACKS.length).toBeGreaterThan(0);
  });

  it("matches the documented table", () => {
    expect(Object.fromEntries(GEM_PACKS.map((p) => [p.id, starsPrice(p)]))).toEqual({
      "gems-500": 375,
      "gems-1200": 775,
      "gems-2600": 1550,
      "gems-7000": 3850,
    });
  });

  it("has no price for a pack that is not in the table", () => {
    expect(starsPrice({ ...PACK, id: "gems-999999" })).toBeNull();
    expect(starsPrice({ ...PACK, id: "constructor" })).toBeNull();
  });

  it("never rounds a cheap pack to zero, and formats for display", () => {
    expect(starsForUsdCents(1)).toBe(25);
    expect(formatStars(1550)).toBe("1,550 Stars");
  });
});

describe("invoice payload", () => {
  it("round-trips the account and pack it was signed for", () => {
    const payload = signInvoicePayload(UID, PACK, TEST_BOT_TOKEN);
    expect(verifyInvoicePayload(payload, TEST_BOT_TOKEN)).toEqual({
      ok: true,
      uid: UID,
      telegramUserId: String(TG_USER_ID),
      pack: PACK,
    });
  });

  it("fits Telegram's 128-byte limit for the longest uid and pack id", () => {
    const longestPack = GEM_PACKS.reduce((a, b) => (b.id.length > a.id.length ? b : a));
    const payload = signInvoicePayload(`telegram:${"9".repeat(20)}`, longestPack, TEST_BOT_TOKEN);
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it.each([
    ["moved to another account", (p: string) => p.replace(UID, "telegram:111")],
    ["moved to a bigger pack", (p: string) => p.replace("gems-1200", "gems-7000")],
    ["signed by another bot", () => signInvoicePayload(UID, PACK, OTHER_BOT_TOKEN)],
    ["with the signature dropped", (p: string) => p.slice(0, p.lastIndexOf("|"))],
    ["with an extra field", (p: string) => `${p}|x`],
    ["of another version", (p: string) => p.replace(/^v1/, "v2")],
  ])("refuses a payload %s", (_label, tamper) => {
    const payload = tamper(signInvoicePayload(UID, PACK, TEST_BOT_TOKEN));
    expect(verifyInvoicePayload(payload, TEST_BOT_TOKEN)).toEqual({ ok: false, refusal: "BAD_PAYLOAD" });
  });

  it("refuses a validly signed payload for a pack the table no longer has", () => {
    const gone: GemPack = { ...PACK, id: "gems-999" };
    const payload = signInvoicePayload(UID, gone, TEST_BOT_TOKEN);
    expect(verifyInvoicePayload(payload, TEST_BOT_TOKEN)).toEqual({ ok: false, refusal: "UNKNOWN_PACK" });
  });

  it("refuses a validly signed payload for an account that is not a Telegram one", () => {
    const payload = signInvoicePayload("apple:abc", PACK, TEST_BOT_TOKEN);
    expect(verifyInvoicePayload(payload, TEST_BOT_TOKEN)).toEqual({ ok: false, refusal: "BAD_PAYLOAD" });
  });

  it.each([undefined, 42, "", "x".repeat(200)])("refuses a non-payload %#", (v) => {
    expect(verifyInvoicePayload(v, TEST_BOT_TOKEN)).toEqual({ ok: false, refusal: "BAD_PAYLOAD" });
  });

  it("reads the Telegram id only from a well-formed telegram uid", () => {
    expect(telegramIdOfUid("telegram:42")).toBe("42");
    for (const uid of ["apple:42", "telegram:0", "telegram:042", "telegram:4x", "telegram:", "discord:42", " telegram:42"]) {
      expect(telegramIdOfUid(uid), uid).toBeNull();
    }
  });
});

describe("checkStarsPayment", () => {
  const claim = (over: Partial<Record<"payload" | "currency" | "totalAmount" | "payerId", unknown>> = {}) => ({
    payload: signInvoicePayload(UID, PACK, TEST_BOT_TOKEN),
    currency: "XTR",
    totalAmount: starsPrice(PACK),
    payerId: TG_USER_ID,
    ...over,
  });
  const refusalOf = (c: ReturnType<typeof claim>) => {
    const r = checkStarsPayment(c, TEST_BOT_TOKEN);
    return r.ok ? "accepted" : r.refusal;
  };

  it("accepts exactly what was invoiced, paid by the invoiced account", () => {
    expect(checkStarsPayment(claim(), TEST_BOT_TOKEN)).toEqual({ ok: true, uid: UID, pack: PACK });
  });

  it.each([
    ["a forged payload", { payload: "v1|telegram:987654321|gems-7000|AAAA" }, "BAD_PAYLOAD"],
    ["another currency", { currency: "USD" }, "WRONG_CURRENCY"],
    ["one Star less", { totalAmount: starsPrice(PACK)! - 1 }, "WRONG_AMOUNT"],
    ["the amount as a string", { totalAmount: String(starsPrice(PACK)) }, "WRONG_AMOUNT"],
    ["another payer", { payerId: TG_USER_ID + 1 }, "WRONG_PAYER"],
    ["the payer id as a string", { payerId: String(TG_USER_ID) }, "WRONG_PAYER"],
    ["no payer", { payerId: undefined }, "WRONG_PAYER"],
  ])("refuses %s", (_label, over, refusal) => {
    expect(refusalOf(claim(over))).toBe(refusal);
  });
});

describe("parseTelegramUpdate", () => {
  it("reads a pre-checkout query", () => {
    const u = parseTelegramUpdate({
      update_id: 1,
      pre_checkout_query: { id: "q1", from: { id: 5 }, currency: "XTR", total_amount: 775, invoice_payload: "p" },
    });
    expect(u).toEqual({ kind: "pre_checkout", queryId: "q1", claim: { payload: "p", currency: "XTR", totalAmount: 775, payerId: 5 } });
  });

  it("reads a successful payment with its charge id", () => {
    const u = parseTelegramUpdate({
      update_id: 2,
      message: {
        from: { id: 5 },
        successful_payment: { currency: "XTR", total_amount: 775, invoice_payload: "p", telegram_payment_charge_id: "c1" },
      },
    });
    expect(u).toEqual({ kind: "payment", chargeId: "c1", claim: { payload: "p", currency: "XTR", totalAmount: 775, payerId: 5 } });
  });

  it("flags a payment with no charge id, and ignores everything else", () => {
    expect(parseTelegramUpdate({ message: { from: { id: 5 }, successful_payment: { currency: "XTR" } } })).toEqual({
      kind: "payment_without_charge_id",
    });
    for (const body of [null, [], "x", { message: { text: "/start" } }, { pre_checkout_query: { id: "" } }]) {
      expect(parseTelegramUpdate(body)).toEqual({ kind: "ignored" });
    }
  });
});
