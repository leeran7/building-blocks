/**
 * PUT /api/settings `avatarId`. The column only ever holds catalogue ids, so
 * the route must reject — not clamp or default — anything else before any
 * write, and must refresh the cached public leaderboard (which renders each
 * row's avatar) only when the avatar actually changes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
}));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));
vi.mock("../../src/db/creator", () => ({
  setUsername: vi.fn(async () => ({ ok: true })),
  clearUsername: vi.fn(async () => {}),
}));

const { updateUserSettings, getUserSettings, updateUserSocialHandles } = vi.hoisted(() => {
  const base = { displayName: null, username: null, social: {}, leaderboardConsent: false };
  return {
    getUserSettings: vi.fn(async () => ({ ...base, avatarId: null as string | null })),
    updateUserSettings: vi.fn(async (_uid: string, input: { avatarId?: string | null }) => ({
      ...base,
      avatarId: input.avatarId ?? null,
    })),
    updateUserSocialHandles: vi.fn(async () => {}),
  };
});
vi.mock("../../src/db/settings", () => ({ getUserSettings, updateUserSettings, updateUserSocialHandles }));

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: (fn: unknown) => fn,
}));

import { GET, PUT } from "../../app/api/settings/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { AVATARS } from "../../src/lib/avatars";

const VALID = AVATARS[0].id;

function put(body: unknown): Promise<Response> {
  return PUT(
    new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/settings avatarId", () => {
  it("saves a catalogue id and returns it", async () => {
    const res = await put({ avatarId: VALID });
    expect(res.status).toBe(200);
    expect(updateUserSettings).toHaveBeenCalledWith("u1", { avatarId: VALID });
    expect(await res.json()).toMatchObject({ avatarId: VALID });
  });

  it("clears the avatar when avatarId is null", async () => {
    const res = await put({ avatarId: null });
    expect(res.status).toBe(200);
    expect(updateUserSettings).toHaveBeenCalledWith("u1", { avatarId: null });
  });

  it.each(["not-an-avatar", "", "__proto__", "constructor", "toString", `${VALID.toUpperCase()}`])(
    "rejects unknown id %j with 400 and saves nothing",
    async (avatarId) => {
      const res = await put({ avatarId, displayName: "Aria" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" });
      expect(updateUserSettings).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    }
  );

  it("rejects a very long id (catalogue id as a prefix) with 400 and saves nothing", async () => {
    const res = await put({ avatarId: VALID + "x".repeat(10_000) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown avatar", code: "UNKNOWN_AVATAR" });
    expect(updateUserSettings).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([42, true, {}, [VALID], { id: VALID }])("rejects non-string avatarId %j with 400", async (avatarId) => {
    const res = await put({ avatarId });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_AVATAR" });
    expect(updateUserSettings).not.toHaveBeenCalled();
  });

  it("revalidates the climb leaderboard when the avatar is set or cleared", async () => {
    await put({ avatarId: VALID });
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 0 });
    revalidateTag.mockClear();
    await put({ avatarId: null });
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 0 });
  });

  it("does not revalidate the leaderboard or touch the avatar when avatarId is absent", async () => {
    const res = await put({ social: {} });
    expect(res.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateUserSettings).toHaveBeenCalledWith("u1", {});
  });
});

describe("GET /api/settings avatarId", () => {
  it("returns the stored avatar so the app can seed the picker", async () => {
    getUserSettings.mockResolvedValueOnce({
      displayName: null,
      username: null,
      social: {},
      leaderboardConsent: false,
      avatarId: VALID,
    });
    const res = await GET(
      new NextRequest("http://localhost/api/settings", { headers: { authorization: "Bearer t" } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ avatarId: VALID });
  });
});
