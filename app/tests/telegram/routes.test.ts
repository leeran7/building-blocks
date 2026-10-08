/**
 * The Telegram routes, driven through their handlers:
 *  - POST /api/auth/telegram: only verified initData mints a custom token;
 *  - POST /api/gems/telegram/invoice: prices from the server table, binds the
 *    payload to the caller, and calls only the fixed Bot API URL;
 *  - POST /api/telegram/webhook: the secret header gates everything; a
 *    pre-checkout is approved only for what would credit; a payment credits
 *    once per charge id.
 *
 * Firebase Admin, the rate limiter and the network are mocked. creditGemPack
 * is the real one, over a minimal in-memory Prisma (users, gem_purchases,
 * gem_ledger), so the duplicate-delivery test exercises its idempotency.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  callerUid: "telegram:987654321",
  users: new Map<string, number>(),
  purchases: new Map<string, { user_id: string; pack_id: string; gems: number }>(),
  ledger: [] as { user_id: string; amount: number; idempotency_key: string }[],
}));

vi.mock("../../src/lib/firebaseAdmin", () => ({
  adminAuth: { createCustomToken: vi.fn(async (uid: string) => `custom-token-for-${uid}`) },
  verifyIdToken: vi.fn(async () => ({ uid: h.callerUid })),
}));
vi.mock("../../src/db/user", () => ({ ensurePlatformUser: vi.fn(async () => {}) }));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "203.0.113.7"),
}));
vi.mock("../../src/db/client", () => {
  type Where = { where: Record<string, unknown> };
  const tx = {
    $queryRaw: async (_sql: TemplateStringsArray, userId: string) =>
      h.users.has(userId) ? [{ gems: h.users.get(userId) }] : [],
    gemPurchase: {
      findUnique: async ({ where }: Where) => {
        const k = where.gem_purchase_provider_external as { provider: string; external_id: string };
        return h.purchases.has(`${k.provider}:${k.external_id}`) ? { id: "p" } : null;
      },
      create: async ({ data }: { data: { provider: string; external_id: string; user_id: string; pack_id: string; gems: number } }) => {
        const key = `${data.provider}:${data.external_id}`;
        if (h.purchases.has(key)) throw new Error("unique violation: gem_purchase_provider_external");
        h.purchases.set(key, { user_id: data.user_id, pack_id: data.pack_id, gems: data.gems });
      },
    },
    user: {
      update: async ({ where, data }: { where: { id: string }; data: { gems: { increment: number } } }) => {
        const gems = (h.users.get(where.id) ?? 0) + data.gems.increment;
        h.users.set(where.id, gems);
        return { gems };
      },
    },
    gemLedger: {
      create: async ({ data }: { data: { user_id: string; amount: number; idempotency_key: string } }) => {
        h.ledger.push(data);
      },
    },
  };
  return { prisma: { $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) } };
});

import { adminAuth } from "../../src/lib/firebaseAdmin";
import { ensurePlatformUser } from "../../src/db/user";
import { checkRateLimit } from "../../src/lib/rateLimit";
import { gemPackById, type GemPack } from "../../src/lib/gemPacks";
import { starsPrice } from "../../src/api/telegramStars";
import { signInvoicePayload, verifyInvoicePayload } from "../../src/api/telegramPayload";
import { POST as authRoute } from "../../app/api/auth/telegram/route";
import { POST as invoiceRoute } from "../../app/api/gems/telegram/invoice/route";
import { POST as webhookRoute } from "../../app/api/telegram/webhook/route";
import { NOW, OTHER_BOT_TOKEN, signInitData, TEST_BOT_TOKEN, TG_USER_ID, validFields, WEBHOOK_SECRET } from "./fixtures";

const UID = `telegram:${TG_USER_ID}`;
const PACK = gemPackById("gems-1200")!;
const PRICE = starsPrice(PACK)!;
const BOT_API = `https://api.telegram.org/bot${TEST_BOT_TOKEN}`;

/** Bot API stand-in: records every call and answers ok, or what `answer` says. */
const botApi = {
  calls: [] as { url: string; body: Record<string, unknown> }[],
  answer: (_url: string): unknown => ({ ok: true, result: true }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TEST_BOT_TOKEN);
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
  h.callerUid = UID;
  h.users = new Map([[UID, 100]]);
  h.purchases = new Map();
  h.ledger = [];
  botApi.calls = [];
  botApi.answer = (url) =>
    url.endsWith("/createInvoiceLink") ? { ok: true, result: "https://t.me/$invoice-abc" } : { ok: true, result: true };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      botApi.calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(JSON.stringify(botApi.answer(url)), { status: 200 });
    })
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/auth/telegram", () => {
  const signIn = (initData: unknown) => authRoute(post("/api/auth/telegram", { initData }));

  it("signs in the verified Telegram user as telegram:<id>", async () => {
    const res = await signIn(signInitData(validFields()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ customToken: `custom-token-for-${UID}` });
    expect(ensurePlatformUser).toHaveBeenCalledWith(UID);
    expect(adminAuth.createCustomToken).toHaveBeenCalledWith(UID, { platform: "telegram" });
  });

  it("rate limits by client IP and fails closed", async () => {
    await signIn(signInitData(validFields()));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "auth:telegram", identifier: "203.0.113.7", failMode: "closed" })
    );
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: true });
    const res = await signIn(signInitData(validFields()));
    expect(res.status).toBe(429);
    expect(adminAuth.createCustomToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signed by another bot", () => signInitData(validFields(), OTHER_BOT_TOKEN)],
    ["with a tampered user", () => signInitData(validFields()).replace("987654321", "987654322")],
    ["stale", () => signInitData(validFields({ auth_date: String(NOW - 2 * 24 * 3600) }))],
    ["from the future", () => signInitData(validFields({ auth_date: String(NOW + 3600) }))],
    ["missing", () => undefined],
  ])("refuses initData that is %s with 401 and mints nothing", async (_label, make) => {
    const res = await signIn(make());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("INVALID_INIT_DATA");
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
    expect(ensurePlatformUser).not.toHaveBeenCalled();
  });

  it("returns 503, not a bypass, when the bot token is not configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    const res = await signIn(signInitData(validFields()));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NOT_CONFIGURED");
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    const res = await authRoute(post("/api/auth/telegram", "initData=x"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/gems/telegram/invoice", () => {
  const invoice = (body: unknown) => invoiceRoute(post("/api/gems/telegram/invoice", body, { authorization: "Bearer t" }));

  it("creates a Stars invoice at the server's price, with a payload bound to the caller and pack", async () => {
    const res = await invoice({ packId: PACK.id, stars: 1, gems: 999999 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invoiceLink: "https://t.me/$invoice-abc" });

    expect(botApi.calls).toHaveLength(1);
    const { url, body } = botApi.calls[0];
    expect(url).toBe(`${BOT_API}/createInvoiceLink`);
    expect(body).toMatchObject({ currency: "XTR", provider_token: "", prices: [{ amount: PRICE }] });
    expect(body.prices).toHaveLength(1);
    expect(verifyInvoicePayload(body.payload, TEST_BOT_TOKEN)).toEqual({
      ok: true,
      uid: UID,
      telegramUserId: String(TG_USER_ID),
      pack: PACK,
    });
  });

  it.each([{ packId: "gems-999999" }, { packId: 1200 }, {}, null])("refuses an unknown pack %j", async (body) => {
    const res = await invoice(body);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNKNOWN_PACK");
    expect(botApi.calls).toHaveLength(0);
  });

  it("refuses an account that is not a Telegram one, before any invoice exists", async () => {
    h.callerUid = "apple-firebase-uid";
    const res = await invoice({ packId: PACK.id });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_TELEGRAM_ACCOUNT");
    expect(botApi.calls).toHaveLength(0);
  });

  it("returns 503 when the bot token is not configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect((await invoice({ packId: PACK.id })).status).toBe(503);
    expect(botApi.calls).toHaveLength(0);
  });

  it("returns 502 when the Bot API refuses or answers something that is not an invoice link", async () => {
    botApi.answer = () => ({ ok: false, description: "Bad Request: currency not supported" });
    expect((await invoice({ packId: PACK.id })).status).toBe(502);
    botApi.answer = () => ({ ok: true, result: "https://evil.example/pay" });
    expect((await invoice({ packId: PACK.id })).status).toBe(502);
  });

  it("is rate limited per account and fails closed", async () => {
    await invoice({ packId: PACK.id });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "gems:telegram:invoice", identifier: UID, failMode: "closed" })
    );
  });
});

describe("POST /api/telegram/webhook", () => {
  const hook = (update: unknown, secret: string | null = WEBHOOK_SECRET) =>
    webhookRoute(post("/api/telegram/webhook", update, secret === null ? {} : { "x-telegram-bot-api-secret-token": secret }));

  const payloadFor = (uid = UID, pack: GemPack = PACK, token = TEST_BOT_TOKEN) => signInvoicePayload(uid, pack, token);

  const preCheckout = (over: Record<string, unknown> = {}) => ({
    update_id: 1,
    pre_checkout_query: {
      id: "query-1",
      from: { id: TG_USER_ID },
      currency: "XTR",
      total_amount: PRICE,
      invoice_payload: payloadFor(),
      ...over,
    },
  });

  const payment = (over: Record<string, unknown> = {}, fromId: number = TG_USER_ID) => ({
    update_id: 2,
    message: {
      message_id: 10,
      from: { id: fromId },
      chat: { id: fromId, type: "private" },
      successful_payment: {
        currency: "XTR",
        total_amount: PRICE,
        invoice_payload: payloadFor(),
        telegram_payment_charge_id: "stxCHARGE1",
        provider_payment_charge_id: "",
        ...over,
      },
    },
  });

  const answers = () => botApi.calls.filter((c) => c.url === `${BOT_API}/answerPreCheckoutQuery`).map((c) => c.body);

  describe("secret token", () => {
    it.each([
      ["missing", null],
      ["wrong", "not-the-secret"],
      ["a prefix of the secret", WEBHOOK_SECRET.slice(0, -1)],
    ])("refuses a %s header with 401 and does nothing", async (_label, secret) => {
      const res = await hook(payment(), secret);
      expect(res.status).toBe(401);
      expect(h.users.get(UID)).toBe(100);
      expect(botApi.calls).toHaveLength(0);
    });

    it("refuses every request when TELEGRAM_WEBHOOK_SECRET is not configured", async () => {
      vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
      expect((await hook(payment(), "")).status).toBe(401);
      expect((await hook(payment(), WEBHOOK_SECRET)).status).toBe(401);
      expect(h.users.get(UID)).toBe(100);
    });
  });

  describe("pre_checkout_query", () => {
    it("approves exactly what was invoiced, at the fixed Bot API URL", async () => {
      const res = await hook(preCheckout());
      expect(res.status).toBe(200);
      expect(answers()).toEqual([{ pre_checkout_query_id: "query-1", ok: true }]);
    });

    it.each([
      ["a forged payload", { invoice_payload: payloadFor(UID, PACK, OTHER_BOT_TOKEN) }],
      ["a payload moved to a bigger pack", { invoice_payload: payloadFor().replace("gems-1200", "gems-7000") }],
      ["an amount below the price", { total_amount: PRICE - 1 }],
      ["another currency", { currency: "USD" }],
      ["another payer", { from: { id: TG_USER_ID + 1 } }],
      ["an unknown pack", { invoice_payload: payloadFor(UID, { ...PACK, id: "gems-999" }) }],
    ])("refuses %s with ok false and a reason", async (_label, over) => {
      const res = await hook(preCheckout(over));
      expect(res.status).toBe(200);
      const [answer] = answers();
      expect(answer).toMatchObject({ pre_checkout_query_id: "query-1", ok: false });
      expect(typeof answer.error_message).toBe("string");
    });

    it("asks Telegram to retry when the answer cannot be sent", async () => {
      botApi.answer = () => ({ ok: false, description: "Bad Gateway" });
      expect((await hook(preCheckout())).status).toBe(500);
    });
  });

  describe("successful_payment", () => {
    it("credits the pack to the account in the payload, keyed on the charge id", async () => {
      const res = await hook(payment());
      expect(res.status).toBe(200);
      expect(h.users.get(UID)).toBe(100 + PACK.gems);
      expect([...h.purchases.entries()]).toEqual([["telegram:stxCHARGE1", { user_id: UID, pack_id: PACK.id, gems: PACK.gems }]]);
    });

    it("credits a redelivered payment once", async () => {
      expect((await hook(payment())).status).toBe(200);
      expect((await hook(payment())).status).toBe(200);
      expect(h.users.get(UID)).toBe(100 + PACK.gems);
      expect(h.ledger).toHaveLength(1);
    });

    it("credits two different charges twice", async () => {
      await hook(payment());
      await hook(payment({ telegram_payment_charge_id: "stxCHARGE2" }));
      expect(h.users.get(UID)).toBe(100 + 2 * PACK.gems);
    });

    it.each([
      ["a forged payload", { invoice_payload: payloadFor(UID, PACK, OTHER_BOT_TOKEN) }, TG_USER_ID],
      ["a payload for another account", { invoice_payload: payloadFor("telegram:111") }, TG_USER_ID],
      ["an amount mismatch", { total_amount: 1 }, TG_USER_ID],
      ["another currency", { currency: "USD" }, TG_USER_ID],
      ["an unknown pack", { invoice_payload: payloadFor(UID, { ...PACK, id: "gems-999" }) }, TG_USER_ID],
      ["a payer who is not the account", {}, TG_USER_ID + 1],
    ])("acks but credits nothing for %s", async (_label, over, fromId) => {
      h.users.set("telegram:111", 0);
      const res = await hook(payment(over, fromId));
      expect(res.status).toBe(200);
      expect(h.users.get(UID)).toBe(100);
      expect(h.users.get("telegram:111")).toBe(0);
      expect(h.purchases.size).toBe(0);
    });

    it("acks a paid pack for an account that no longer exists, crediting nothing", async () => {
      h.users.delete(UID);
      expect((await hook(payment())).status).toBe(200);
      expect(h.purchases.size).toBe(0);
    });

    it("returns 503, keeping the update for later, when the bot token is missing", async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
      expect((await hook(payment())).status).toBe(503);
      expect(h.users.get(UID)).toBe(100);
    });
  });

  it("acks updates it does not handle", async () => {
    expect((await hook({ update_id: 3, message: { text: "/start", from: { id: 1 } } })).status).toBe(200);
    expect((await hook("not json")).status).toBe(200);
    expect(botApi.calls).toHaveLength(0);
  });
});
