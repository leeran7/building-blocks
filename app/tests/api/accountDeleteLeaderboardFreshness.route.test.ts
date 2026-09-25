/**
 * DELETE /api/account/delete against Next's REAL cache: the next read of either
 * public leaderboard after a successful delete must no longer show the
 * account.
 *
 * `revalidateTag(tag, { expire: 60 })` is stale-while-revalidate in Next 16:
 * the next read still serves the cached board with the deleted player on it.
 * Only `{ expire: 0 }` makes that read a miss. See ./realNextCache.
 */

// Must come first: Next's request storage reads this global when it loads.
import "./nodeAsyncStorage";
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
const tx = vi.hoisted(() => ({ fail: false }));
vi.mock("../../src/db/client", () => ({
  prisma: {
    climbRun: { deleteMany: vi.fn(() => ({})) },
    climbRecord: { deleteMany: vi.fn(() => ({})) },
    duelStats: { deleteMany: vi.fn(() => ({})) },
    savedSocialHandle: { deleteMany: vi.fn(() => ({})) },
    user: { updateMany: vi.fn(() => ({})) },
    $transaction: vi.fn(async () => {
      if (tx.fail) throw new Error("db down");
    }),
  },
}));

import type { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { DELETE } from "../../app/api/account/delete/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";
import { inRequest, newIncrementalCache, warmBoard } from "./realNextCache";

const ROUTE = "/api/account/delete";

function del(): Promise<Response> {
  return inRequest(incrementalCache, ROUTE, () =>
    DELETE(
      new NextRequest(`http://localhost${ROUTE}`, {
        method: "DELETE",
        headers: { authorization: "Bearer t" },
      })
    )
  );
}

let incrementalCache: IncrementalCache;
let run = 0;

beforeEach(() => {
  incrementalCache = newIncrementalCache();
  tx.fail = false;
  run += 1;
});

const warm = (tag: string, initial: string) => warmBoard(incrementalCache, tag, `delete-${run}`, initial);

describe("DELETE /api/account/delete makes the next leaderboard read fresh", () => {
  it("drops the deleted account from both boards on the very next read", async () => {
    const climb = await warm(LEADERBOARD_CACHE_TAG, "climb:with-u1");
    const duel = await warm(DUEL_LEADERBOARD_CACHE_TAG, "duel:with-u1");
    climb.set("climb:without-u1");
    duel.set("duel:without-u1");
    // Control: without a delete the cache still serves the warmed boards.
    expect(await climb.read()).toBe("climb:with-u1");
    expect(await duel.read()).toBe("duel:with-u1");

    const res = await del();
    expect(res.status).toBe(200);
    expect(await climb.read()).toBe("climb:without-u1");
    expect(await duel.read()).toBe("duel:without-u1");
  });

  it("leaves both boards cached when the delete transaction fails", async () => {
    const climb = await warm(LEADERBOARD_CACHE_TAG, "climb:old");
    const duel = await warm(DUEL_LEADERBOARD_CACHE_TAG, "duel:old");
    climb.set("climb:new");
    duel.set("duel:new");
    tx.fail = true;

    const res = await del();
    expect(res.status).toBe(500);
    expect(await climb.read()).toBe("climb:old");
    expect(await duel.read()).toBe("duel:old");
  });
});
