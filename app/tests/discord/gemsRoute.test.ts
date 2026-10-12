/**
 * POST /api/gems/discord, driven through the real handler and the real
 * settlement (src/api/discordEntitlements.ts). Discord is a fake `fetch`
 * holding a list of entitlements and a consume endpoint; the db layer is a
 * fake that keeps the one rule the real one guarantees (gems.pg.test.ts):
 * a credit is unique on (provider, external id).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(),
  adminAuth: { createCustomToken: vi.fn() },
}));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/db/gems", () => ({ creditGemPack: vi.fn(), gemBalance: vi.fn() }));

import { verifyIdToken } from "../../src/lib/firebaseAdmin";
import { checkRateLimit } from "../../src/lib/rateLimit";
import { creditGemPack, gemBalance } from "../../src/db/gems";
import { gemPackById } from "../../src/lib/gemPacks";
import { POST } from "../../app/api/gems/discord/route";

const APP_ID = "1290000000000000000";
const DISCORD_ID = "80351110224678912";
const UID = `discord:${DISCORD_ID}`;
const SKU_500 = "1300000000000000500";
const SKU_1200 = "1300000000000001200";
const SKU_UNKNOWN = "1300000000000009999";
const BOT_TOKEN = "bot-token";

interface Entitlement {
  id: string;
  sku_id: string;
  application_id: string;
  user_id: string;
  type: number;
  consumed: boolean;
  deleted: boolean;
}

const ent = (id: string, sku: string, over: Partial<Entitlement> = {}): Entitlement => ({
  id,
  sku_id: sku,
  application_id: APP_ID,
  user_id: DISCORD_ID,
  type: 1,
  consumed: false,
  deleted: false,
  ...over,
});

/** A fake Discord entitlements API. `failConsume` ids answer 500 to consume. */
function fakeDiscord(entitlements: Entitlement[], opts: { failConsume?: Set<string>; listStatus?: number } = {}) {
  const log: string[] = [];
  const authHeaders: (string | null)[] = [];
  const listUrls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    authHeaders.push(new Headers(init?.headers).get("authorization"));
    const base = `https://discord.com/api/v10/applications/${APP_ID}/entitlements`;
    if (url.origin + url.pathname === base && (init?.method ?? "GET") === "GET") {
      listUrls.push(url);
      log.push("list");
      if (opts.listStatus) return new Response("{}", { status: opts.listStatus });
      return Response.json(entitlements);
    }
    const consume = url.pathname.match(/\/entitlements\/(\d+)\/consume$/);
    if (consume && init?.method === "POST") {
      log.push(`consume:${consume[1]}`);
      if (opts.failConsume?.has(consume[1])) return new Response("{}", { status: 500 });
      const e = entitlements.find((x) => x.id === consume[1]);
      if (e) e.consumed = true;
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, log, authHeaders, listUrls };
}

/** Fake gem store: credits are unique on (provider, externalId), like gem_purchases. */
function fakeGemStore(log: string[]) {
  const credited = new Set<string>();
  let gems = 0;
  vi.mocked(creditGemPack).mockImplementation(async ({ provider, externalId, pack }) => {
    log.push(`credit:${externalId}`);
    const key = `${provider}:${externalId}`;
    if (credited.has(key)) return { outcome: "duplicate", balance: gems };
    credited.add(key);
    gems += pack.gems;
    return { outcome: "credited", balance: gems };
  });
  vi.mocked(gemBalance).mockImplementation(async () => gems);
  return { balance: () => gems };
}

const post = (body: unknown = undefined) =>
  POST(
    new NextRequest("http://localhost/api/gems/discord", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyIdToken).mockResolvedValue({ uid: UID } as Awaited<ReturnType<typeof verifyIdToken>>);
  vi.stubEnv("DISCORD_CLIENT_ID", APP_ID);
  vi.stubEnv("DISCORD_BOT_TOKEN", BOT_TOKEN);
  vi.stubEnv("DISCORD_GEM_SKUS", JSON.stringify({ [SKU_500]: "gems-500", [SKU_1200]: "gems-1200" }));
  vi.stubEnv("DISCORD_TEST_PURCHASE_UIDS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/gems/discord", () => {
  it("credits each unconsumed gem-pack entitlement from the pack table, then consumes it", async () => {
    const d = fakeDiscord([ent("2000000000000000001", SKU_500), ent("2000000000000000002", SKU_1200)]);
    const store = fakeGemStore(d.log);

    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gems: 1700, credited: 2, duplicates: 0 });
    expect(creditGemPack).toHaveBeenCalledWith({
      userId: UID,
      provider: "discord",
      externalId: "2000000000000000001",
      pack: gemPackById("gems-500"),
    });
    // Credit strictly before consume, per entitlement.
    expect(d.log).toEqual([
      "list",
      "credit:2000000000000000001",
      "consume:2000000000000000001",
      "credit:2000000000000000002",
      "consume:2000000000000000002",
    ]);
    expect(store.balance()).toBe(1700);
    // The list is this user's, from this app, with the bot token.
    expect(d.listUrls[0].searchParams.get("user_id")).toBe(DISCORD_ID);
    expect(d.listUrls[0].searchParams.get("exclude_ended")).toBe("true");
    expect(d.authHeaders.every((h) => h === `Bot ${BOT_TOKEN}`)).toBe(true);
  });

  it("ignores an entitlement whose SKU is not in the table: no credit, no consume", async () => {
    const d = fakeDiscord([ent("2000000000000000003", SKU_UNKNOWN), ent("2000000000000000004", SKU_500)]);
    fakeGemStore(d.log);

    const res = await post();
    expect(await res.json()).toEqual({ gems: 500, credited: 1, duplicates: 0 });
    expect(d.log).not.toContain("credit:2000000000000000003");
    expect(d.log).not.toContain("consume:2000000000000000003");
  });

  it("credits an entitlement once across two calls", async () => {
    const d = fakeDiscord([ent("2000000000000000005", SKU_1200)]);
    const store = fakeGemStore(d.log);

    expect(await (await post()).json()).toEqual({ gems: 1200, credited: 1, duplicates: 0 });
    // Now consumed on Discord: the second call credits nothing.
    expect(await (await post()).json()).toEqual({ gems: 1200, credited: 0, duplicates: 0 });
    expect(creditGemPack).toHaveBeenCalledTimes(1);
    expect(store.balance()).toBe(1200);
  });

  it("leaves a failed consume to the next call, which retries it without crediting again", async () => {
    const failConsume = new Set(["2000000000000000006"]);
    const d = fakeDiscord([ent("2000000000000000006", SKU_500)], { failConsume });
    const store = fakeGemStore(d.log);

    const first = await post();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ gems: 500, credited: 1, duplicates: 0 });

    failConsume.clear();
    const second = await post();
    expect(await second.json()).toEqual({ gems: 500, credited: 0, duplicates: 1 });
    expect(d.log.filter((l) => l === "consume:2000000000000000006")).toHaveLength(2);
    expect(store.balance()).toBe(500);

    // Consumed now: a third call touches nothing.
    await post();
    expect(d.log.filter((l) => l.startsWith("credit:"))).toHaveLength(2);
    expect(store.balance()).toBe(500);
  });

  it("does not consume when the credit fails, so the purchase stays claimable", async () => {
    const d = fakeDiscord([ent("2000000000000000007", SKU_500)]);
    vi.mocked(creditGemPack).mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(d.log).toEqual(["list"]);
  });

  it.each([
    ["an email account", "u1"],
    ["a Telegram account", "telegram:12345"],
    ["a malformed discord uid", "discord:abc"],
    ["a discord uid with a leading zero", "discord:0123"],
  ])("refuses %s with 403 before calling Discord", async (_label, uid) => {
    vi.mocked(verifyIdToken).mockResolvedValue({ uid } as Awaited<ReturnType<typeof verifyIdToken>>);
    const d = fakeDiscord([ent("2000000000000000008", SKU_500)]);
    fakeGemStore(d.log);
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_DISCORD_ACCOUNT");
    expect(d.fetchMock).not.toHaveBeenCalled();
    expect(creditGemPack).not.toHaveBeenCalled();
  });

  it("ignores the request body: SKU, pack, gems and entitlement id all come from Discord", async () => {
    const d = fakeDiscord([ent("2000000000000000009", SKU_500)]);
    const store = fakeGemStore(d.log);
    const res = await post({
      skuId: SKU_1200,
      packId: "gems-7000",
      gems: 99999,
      entitlementId: "2999999999999999999",
      userId: "999999999999999999",
    });
    expect(await res.json()).toEqual({ gems: 500, credited: 1, duplicates: 0 });
    expect(creditGemPack).toHaveBeenCalledTimes(1);
    expect(creditGemPack).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "2000000000000000009", pack: gemPackById("gems-500") })
    );
    expect(d.listUrls[0].searchParams.get("user_id")).toBe(DISCORD_ID);
    expect(store.balance()).toBe(500);
  });

  it("credits nothing from a body alone when Discord lists no entitlements", async () => {
    const d = fakeDiscord([]);
    fakeGemStore(d.log);
    const res = await post({ entitlementId: "2000000000000000010", skuId: SKU_500 });
    expect(await res.json()).toEqual({ gems: 0, credited: 0, duplicates: 0 });
    expect(creditGemPack).not.toHaveBeenCalled();
  });

  it("skips entitlements that are consumed, deleted, another user's or another app's", async () => {
    const d = fakeDiscord([
      ent("2000000000000000011", SKU_500, { consumed: true }),
      ent("2000000000000000012", SKU_500, { deleted: true }),
      ent("2000000000000000013", SKU_500, { user_id: "111111111111111111" }),
      ent("2000000000000000014", SKU_500, { application_id: "222222222222222222" }),
    ]);
    fakeGemStore(d.log);
    expect(await (await post()).json()).toEqual({ gems: 0, credited: 0, duplicates: 0 });
    expect(creditGemPack).not.toHaveBeenCalled();
    expect(d.log).toEqual(["list"]);
  });

  it("credits free test purchases only for allow-listed uids", async () => {
    const d = fakeDiscord([ent("2000000000000000015", SKU_500, { type: 4 })]);
    fakeGemStore(d.log);
    expect(await (await post()).json()).toEqual({ gems: 0, credited: 0, duplicates: 0 });
    expect(creditGemPack).not.toHaveBeenCalled();

    vi.stubEnv("DISCORD_TEST_PURCHASE_UIDS", `discord:123, ${UID}`);
    expect(await (await post()).json()).toEqual({ gems: 500, credited: 1, duplicates: 0 });
  });

  it("answers 502 when Discord will not list entitlements, crediting nothing", async () => {
    const d = fakeDiscord([ent("2000000000000000016", SKU_500)], { listStatus: 503 });
    fakeGemStore(d.log);
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("DISCORD_UNAVAILABLE");
    expect(creditGemPack).not.toHaveBeenCalled();
  });

  it.each([["DISCORD_CLIENT_ID"], ["DISCORD_BOT_TOKEN"], ["DISCORD_GEM_SKUS"]])(
    "answers 503 when %s is unset",
    async (name) => {
      const d = fakeDiscord([ent("2000000000000000017", SKU_500)]);
      fakeGemStore(d.log);
      vi.stubEnv(name, "");
      const res = await post();
      expect(res.status).toBe(503);
      expect(d.fetchMock).not.toHaveBeenCalled();
    }
  );

  it("refuses with 429 per uid, failing closed", async () => {
    const d = fakeDiscord([ent("2000000000000000018", SKU_500)]);
    fakeGemStore(d.log);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: true });
    const res = await post();
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "gems:discord", identifier: UID, failMode: "closed" })
    );
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 without a valid Firebase token", async () => {
    vi.mocked(verifyIdToken).mockRejectedValue(new Error("bad token"));
    const d = fakeDiscord([]);
    const res = await post();
    expect(res.status).toBe(401);
    expect(d.fetchMock).not.toHaveBeenCalled();
  });
});
