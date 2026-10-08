/**
 * POST /api/auth/discord, driven through the real handler, the real Discord
 * verifier (src/api/discordAuth.ts) and the real platformAuth. Discord itself
 * is a fake `fetch`; Firebase Admin, the users table and Redis are mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(),
  adminAuth: { createCustomToken: vi.fn(async (uid: string) => `custom-token-for-${uid}`) },
}));
vi.mock("../../src/db/user", () => ({ ensurePlatformUser: vi.fn(async () => undefined) }));
vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "203.0.113.7"),
}));

import { adminAuth } from "../../src/lib/firebaseAdmin";
import { ensurePlatformUser } from "../../src/db/user";
import { checkRateLimit } from "../../src/lib/rateLimit";
import { DISCORD_ME_URL, DISCORD_TOKEN_URL } from "../../src/api/discordAuth";
import { POST } from "../../app/api/auth/discord/route";

const DISCORD_ID = "80351110224678912";
const CODE = "AbC123xyz";

interface FakeDiscord {
  token?: { status: number; body: unknown };
  me?: { status: number; body: unknown };
}

/** A fake Discord: answers the token and /users/@me URLs, records every call. */
function fakeDiscord(over: FakeDiscord = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const token = over.token ?? { status: 200, body: { access_token: "discord-at", token_type: "Bearer", scope: "identify" } };
  const me = over.me ?? { status: 200, body: { id: DISCORD_ID, username: "climber" } };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = url === DISCORD_TOKEN_URL ? token : url === DISCORD_ME_URL ? me : { status: 404, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost/api/auth/discord", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DISCORD_CLIENT_ID", "1290000000000000000");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "s3cret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/auth/discord", () => {
  it("exchanges the code at Discord's fixed URL and signs in the user /users/@me names", async () => {
    const { calls } = fakeDiscord();
    // A hostile Host / Origin must not move where the secret goes.
    const res = await post({ code: CODE }, { host: "evil.example", origin: "https://evil.example" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ customToken: `custom-token-for-discord:${DISCORD_ID}`, accessToken: "discord-at" });
    expect(calls.map((c) => c.url)).toEqual([DISCORD_TOKEN_URL, DISCORD_ME_URL]);
    const form = new URLSearchParams(String(calls[0].init?.body));
    expect(Object.fromEntries(form)).toEqual({
      client_id: "1290000000000000000",
      client_secret: "s3cret",
      grant_type: "authorization_code",
      code: CODE,
    });
    expect(new Headers(calls[1].init?.headers).get("authorization")).toBe("Bearer discord-at");
    expect(ensurePlatformUser).toHaveBeenCalledWith(`discord:${DISCORD_ID}`);
    expect(adminAuth.createCustomToken).toHaveBeenCalledWith(`discord:${DISCORD_ID}`, { platform: "discord" });
  });

  it("ignores any user id in the request body", async () => {
    fakeDiscord();
    const res = await post({ code: CODE, id: "999999999999999999", uid: "discord:999999999999999999" });
    expect(res.status).toBe(200);
    expect(adminAuth.createCustomToken).toHaveBeenCalledWith(`discord:${DISCORD_ID}`, { platform: "discord" });
  });

  it("refuses with 401 when Discord rejects the code, minting nothing", async () => {
    fakeDiscord({ token: { status: 400, body: { error: "invalid_grant" } } });
    const res = await post({ code: CODE });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("CODE_REJECTED");
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
    expect(ensurePlatformUser).not.toHaveBeenCalled();
  });

  it("answers 502 when the token exchange fails on Discord's side or the network", async () => {
    fakeDiscord({ token: { status: 503, body: {} } });
    expect((await post({ code: CODE })).status).toBe(502);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const res = await post({ code: CODE });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("DISCORD_UNAVAILABLE");
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it("answers 502 when the token response is not a bearer token", async () => {
    fakeDiscord({ token: { status: 200, body: { access_token: "x", token_type: "mac" } } });
    expect((await post({ code: CODE })).status).toBe(502);
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it("answers 502 when /users/@me fails, minting nothing", async () => {
    fakeDiscord({ me: { status: 401, body: { message: "401: Unauthorized" } } });
    const res = await post({ code: CODE });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("DISCORD_UNAVAILABLE");
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
    expect(ensurePlatformUser).not.toHaveBeenCalled();
  });

  it.each([
    ["a number, not a string", 80351110224678912],
    ["letters", "abc"],
    ["a leading zero", "0123"],
    ["21 digits", "123456789012345678901"],
    ["a uid separator", "1:2"],
    ["missing", undefined],
  ])("refuses a malformed user id from /users/@me (%s)", async (_label, id) => {
    fakeDiscord({ me: { status: 200, body: { id } } });
    const res = await post({ code: CODE });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("BAD_USER");
    expect(ensurePlatformUser).not.toHaveBeenCalled();
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it.each([["DISCORD_CLIENT_ID"], ["DISCORD_CLIENT_SECRET"]])("answers 503 when %s is unset, calling nobody", async (name) => {
    const { fetchMock } = fakeDiscord();
    vi.stubEnv(name, "");
    const res = await post({ code: CODE });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("refuses with 429 by client IP, failing closed, before calling Discord", async () => {
    const { fetchMock } = fakeDiscord();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, degraded: false });
    const res = await post({ code: CODE });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "auth:discord:ip", identifier: "203.0.113.7", failMode: "closed" })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses with 429 when the verified Discord user is over its budget, minting nothing", async () => {
    fakeDiscord();
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true, degraded: false })
      .mockResolvedValueOnce({ allowed: false, degraded: false });
    const res = await post({ code: CODE });
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ namespace: "auth:discord:user", identifier: DISCORD_ID, failMode: "closed" })
    );
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled();
  });

  it.each([
    ["no code", {}],
    ["a non-string code", { code: 12345 }],
    ["a code with a URL in it", { code: "https://evil.example/x" }],
    ["invalid JSON", "{"],
  ])("answers 400 for %s without calling Discord", async (_label, body) => {
    const { fetchMock } = fakeDiscord();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
