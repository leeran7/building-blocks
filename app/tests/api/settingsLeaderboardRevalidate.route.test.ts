/**
 * PUT /api/settings — leaderboard cache revalidation on consent / display
 * name changes.
 *
 * Both topFreeClimbers and topDuelStats are cached for up to 60s
 * (unstable_cache, time-based only). Without an on-demand revalidateTag
 * call here, changing what gates a player's visibility on either public
 * leaderboard — leaderboard consent for the climb board, display_name for
 * the duel board — wouldn't visibly take effect until that window rolled
 * over. This proves each tag fires exactly when its gating field is part
 * of the patch, not on every save.
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
    social: {},
    leaderboardConsent: false,
  })),
  updateUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    social: {},
    leaderboardConsent: true,
  })),
  updateUserSocialHandles: vi.fn(async () => {}),
}));

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag,
  // ../../src/db/climb and ../../src/db/duel (imported below for their cache
  // tag constants) each wrap a query in unstable_cache at module load — a
  // passthrough here keeps those imports side-effect-free for this test.
  unstable_cache: (fn: unknown) => fn,
}));

import { PUT } from "../../app/api/settings/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";

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

  it("revalidates the climb leaderboard tag when leaderboardConsent changes, not the duel one", async () => {
    const res = await put({ leaderboardConsent: true });
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 0 });
    expect(revalidateTag).not.toHaveBeenCalledWith(DUEL_LEADERBOARD_CACHE_TAG, expect.anything());
  });

  it("revalidates the duel leaderboard tag when displayName changes, not the climb one", async () => {
    const res = await put({ displayName: "Aria" });
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(DUEL_LEADERBOARD_CACHE_TAG, { expire: 0 });
    expect(revalidateTag).not.toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, expect.anything());
  });

  it("does not revalidate either leaderboard on an unrelated save", async () => {
    const res = await put({ social: {} });
    expect(res.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
