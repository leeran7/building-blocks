/**
 * PUT /api/settings — leaderboard cache revalidation on consent change.
 *
 * topFreeClimbers (the public leaderboard read) is cached for up to 60s.
 * Without an on-demand revalidateTag call here, a consent toggle wouldn't
 * visibly take effect until that window rolled over — this proves the tag
 * fires exactly when leaderboardConsent is part of the patch, not on every
 * unrelated save.
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
vi.mock("../../src/db/settings", () => ({
  getUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    urls: [],
    social: {},
    leaderboardConsent: false,
  })),
  updateUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    urls: [],
    social: {},
    leaderboardConsent: true,
  })),
  updateUserSocialHandles: vi.fn(async () => {}),
}));

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag,
  // ../../src/db/climb (imported below for LEADERBOARD_CACHE_TAG) wraps
  // topFreeClimbers in unstable_cache at module load — a passthrough here
  // keeps that import side-effect-free for this test.
  unstable_cache: (fn: unknown) => fn,
}));

import { PUT } from "../../app/api/settings/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";

function put(body: unknown): Promise<Response> {
  return PUT(
    new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );
}

describe("PUT /api/settings leaderboard revalidation", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
  });

  it("revalidates the leaderboard cache tag when leaderboardConsent changes", async () => {
    const res = await put({ leaderboardConsent: true });
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 60 });
  });

  it("does not revalidate the leaderboard on an unrelated save", async () => {
    const res = await put({ displayName: "Aria" });
    expect(res.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
