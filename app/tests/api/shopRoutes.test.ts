/**
 * The Shop's money routes, driven through their handlers:
 *  - POST /api/webhook/stripe with metadata.type "gem_pack": credits only a
 *    paid session that charged exactly the pack's USD price, from the pack
 *    table, and dead-letters anything it cannot attribute;
 *  - POST /api/gems/apple: credits only a transaction checkAppleGemTransaction
 *    accepts, keyed on the App Store transaction id;
 *  - POST /api/shop/buy: names only the item; refusals map to statuses.
 * Signature checks and the db layer are mocked; the rules they rely on are
 * tested in appleIap.test.ts and gems.pg.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
}));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/api/stripe", () => ({ verifyWebhookSignature: vi.fn(), getStripe: vi.fn() }));
vi.mock("../../src/db/credits", () => ({ addPurchasedCredits: vi.fn() }));
vi.mock("../../src/db/deadLetter", () => ({ recordDeadLetter: vi.fn() }));
vi.mock("../../src/api/appleIap", () => ({ checkAppleGemTransaction: vi.fn(), appleAccountTokenFor: vi.fn() }));
vi.mock("../../src/db/gems", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/db/gems")>();
  return { GemError: real.GemError, creditGemPack: vi.fn(), buyCharacter: vi.fn(), shopState: vi.fn() };
});

import { verifyWebhookSignature } from "../../src/api/stripe";
import { recordDeadLetter } from "../../src/db/deadLetter";
import { checkAppleGemTransaction } from "../../src/api/appleIap";
import { buyCharacter, creditGemPack, GemError } from "../../src/db/gems";
import { gemPackById } from "../../src/lib/gemPacks";
import { POST as webhook } from "../../app/api/webhook/stripe/route";
import { POST as appleRoute } from "../../app/api/gems/apple/route";
import { POST as buyRoute } from "../../app/api/shop/buy/route";

const PACK = gemPackById("gems-1200")!;

function gemEvent(over: { payment_status?: string; amount_total?: number; currency?: string; metadata?: object } = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_gems_1",
        amount_total: over.amount_total ?? PACK.usdCents,
        currency: over.currency ?? "usd",
        payment_status: over.payment_status ?? "paid",
        metadata: over.metadata ?? { type: "gem_pack", user_id: "u1", pack_id: PACK.id },
      },
    },
  } as unknown as Stripe.Event;
}

const hook = () =>
  webhook(
    new NextRequest("http://localhost/api/webhook/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=x" },
      body: "{}",
    })
  );

const authed = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(creditGemPack).mockResolvedValue({ outcome: "credited", balance: 1200 });
});

describe("Stripe webhook: gem packs", () => {
  it("credits a paid session from the pack table, keyed on the session id", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(gemEvent());
    const res = await hook();
    expect(res.status).toBe(200);
    expect(creditGemPack).toHaveBeenCalledWith({ userId: "u1", provider: "stripe", externalId: "cs_gems_1", pack: PACK });
    expect(recordDeadLetter).not.toHaveBeenCalled();
  });

  it("does not credit an unpaid session", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(gemEvent({ payment_status: "unpaid" }));
    expect((await hook()).status).toBe(200);
    expect(creditGemPack).not.toHaveBeenCalled();
  });

  it.each([
    ["an amount that is not the pack's price", { amount_total: 1 }],
    ["another currency", { currency: "eur" }],
    ["an unknown pack", { metadata: { type: "gem_pack", user_id: "u1", pack_id: "gems-999999" } }],
    ["no user", { metadata: { type: "gem_pack", pack_id: PACK.id } }],
  ])("dead-letters %s and credits nothing", async (_label, over) => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(gemEvent(over));
    const res = await hook();
    expect(res.status).toBe(200);
    expect(creditGemPack).not.toHaveBeenCalled();
    expect(recordDeadLetter).toHaveBeenCalledTimes(1);
  });

  it("dead-letters a paid pack for an account that no longer exists", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(gemEvent());
    vi.mocked(creditGemPack).mockRejectedValue(new GemError("NO_USER", "No account for this user"));
    expect((await hook()).status).toBe(200);
    expect(recordDeadLetter).toHaveBeenCalledTimes(1);
  });

  it("asks Stripe to retry an unexpected failure", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(gemEvent());
    vi.mocked(creditGemPack).mockRejectedValue(new Error("db down"));
    expect((await hook()).status).toBe(500);
    expect(recordDeadLetter).not.toHaveBeenCalled();
  });
});

describe("POST /api/gems/apple", () => {
  it("credits an accepted transaction once, keyed on its App Store transaction id", async () => {
    vi.mocked(checkAppleGemTransaction).mockReturnValue({
      ok: true,
      transaction: { transactionId: "2000000001", bundleId: "lol.doomstack.app", productId: PACK.appleProductId },
      pack: PACK,
    });
    const res = await appleRoute(authed("/api/gems/apple", { jws: "a.b.c" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "credited", gems: 1200, packId: PACK.id });
    expect(checkAppleGemTransaction).toHaveBeenCalledWith("a.b.c", "u1");
    expect(creditGemPack).toHaveBeenCalledWith({ userId: "u1", provider: "apple", externalId: "2000000001", pack: PACK });
  });

  it("refuses a rejected transaction with its code and credits nothing", async () => {
    vi.mocked(checkAppleGemTransaction).mockReturnValue({ ok: false, refusal: "WRONG_ACCOUNT", transactionId: "1" });
    const res = await appleRoute(authed("/api/gems/apple", { jws: "a.b.c", gems: 100000 }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("WRONG_ACCOUNT");
    expect(creditGemPack).not.toHaveBeenCalled();
  });

  it("requires a signed-in player", async () => {
    const res = await appleRoute(
      new NextRequest("http://localhost/api/gems/apple", { method: "POST", body: JSON.stringify({ jws: "a.b.c" }) })
    );
    expect(res.status).toBe(401);
    expect(checkAppleGemTransaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/shop/buy", () => {
  it("buys the named catalogue item and returns the new balance", async () => {
    vi.mocked(buyCharacter).mockResolvedValue({ gems: 0, ownedIds: ["lynx-void"] });
    const res = await buyRoute(authed("/api/shop/buy", { avatarId: "lynx-void", price: 0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gems: 0, ownedIds: ["lynx-void"] });
    expect(buyCharacter).toHaveBeenCalledWith("u1", "lynx-void");
  });

  it.each(["__proto__", "not-a-skin", 7, null])("refuses %j before any purchase", async (avatarId) => {
    const res = await buyRoute(authed("/api/shop/buy", { avatarId }));
    expect(res.status).toBe(400);
    expect(buyCharacter).not.toHaveBeenCalled();
  });

  it.each([
    ["INSUFFICIENT_GEMS", 402],
    ["OWNED", 409],
    ["CHARACTER_REQUIRED", 409],
    ["NOT_FOR_SALE", 400],
  ] as const)("maps %s to %i", async (code, status) => {
    vi.mocked(buyCharacter).mockRejectedValue(new GemError(code, "no", code === "INSUFFICIENT_GEMS" ? 5 : null));
    const res = await buyRoute(authed("/api/shop/buy", { avatarId: "wraith" }));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    if (code === "INSUFFICIENT_GEMS") expect(body.gems).toBe(5);
  });
});
