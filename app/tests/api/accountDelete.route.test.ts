/**
 * DELETE /api/account/delete — leaderboard cache revalidation.
 *
 * The route deletes the user's climbRecord and duelStats rows and anonymizes
 * display_name outright, so both topFreeClimbers and topDuelStats stop
 * matching them at the DB level immediately. But each is cached for up to
 * 60s (unstable_cache, time-based only) — without an on-demand revalidateTag
 * call, a deleted account stays publicly visible on both leaderboards until
 * that window rolls over. This proves both tags fire on a successful delete.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, degraded: false })),
  clientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("../../src/lib/firebaseAdmin", () => ({
  verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u@e.com", email_verified: true })),
  adminAuth: { deleteUser: vi.fn(async () => {}) },
}));
vi.mock("../../src/db/client", () => ({
  prisma: {
    climbRun: { deleteMany: vi.fn(() => ({})) },
    climbRecord: { deleteMany: vi.fn(() => ({})) },
    duelStats: { deleteMany: vi.fn(() => ({})) },
    savedUrl: { deleteMany: vi.fn(() => ({})) },
    savedSocialHandle: { deleteMany: vi.fn(() => ({})) },
    user: { updateMany: vi.fn(() => ({})) },
    $transaction: vi.fn(async () => {}),
  },
}));

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag,
  // ../../src/db/climb and ../../src/db/duel (imported below for their cache
  // tag constants) each wrap a query in unstable_cache at module load — a
  // passthrough here keeps those imports side-effect-free for this test.
  unstable_cache: (fn: unknown) => fn,
}));

import { DELETE } from "../../app/api/account/delete/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";

function del(): Promise<Response> {
  return DELETE(
    new NextRequest("http://localhost/api/account/delete", {
      method: "DELETE",
      headers: { authorization: "Bearer t" },
    })
  );
}

describe("DELETE /api/account/delete leaderboard revalidation", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
  });

  it("revalidates both the climb and duel leaderboard tags after a successful delete", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith(LEADERBOARD_CACHE_TAG, { expire: 60 });
    expect(revalidateTag).toHaveBeenCalledWith(DUEL_LEADERBOARD_CACHE_TAG, { expire: 60 });
  });
});
