/**
 * PUT /api/settings against Next's REAL cache: after a consent, avatar or
 * display-name save, the next read of a leaderboard cached under the
 * matching tag must be fresh.
 *
 * The sibling route tests mock revalidateTag and only check its arguments.
 * That cannot tell `{ expire: 0 }` (immediate expiry) from `{ expire: 60 }`
 * (stale-while-revalidate in Next 16, which serves the old body once more).
 * Here next/cache is real: an in-memory IncrementalCache backs a real
 * unstable_cache entry. The route's revalidateTag runs inside a work store and
 * is flushed the way Next flushes it at the end of a request.
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
}));
vi.mock("../../src/db/user", () => ({ ensureUser: vi.fn(async () => {}) }));
vi.mock("../../src/db/creator", () => ({
  setUsername: vi.fn(async () => ({ ok: true })),
  clearUsername: vi.fn(async () => {}),
}));
vi.mock("../../src/db/settings", () => ({
  getUserSettings: vi.fn(),
  updateUserSettings: vi.fn(async () => ({
    displayName: null,
    username: null,
    social: {},
    leaderboardConsent: false,
    avatarId: null,
  })),
  updateUserSocialHandles: vi.fn(async () => {}),
}));

import { PUT } from "../../app/api/settings/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";
import { AVATARS } from "../../src/lib/avatars";
import { inRequest, newIncrementalCache, warmBoard } from "./realNextCache";
import type { IncrementalCache } from "next/dist/server/lib/incremental-cache";

function put(body: unknown): Promise<Response> {
  return PUT(
    new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );
}

let incrementalCache: IncrementalCache;
let run = 0;

beforeEach(() => {
  incrementalCache = newIncrementalCache();
  run += 1;
});

const ROUTE = "/api/settings";
const warm = (tag: string, initial: string) => warmBoard(incrementalCache, tag, String(run), initial);
const save = (body: unknown) => inRequest(incrementalCache, ROUTE, () => put(body));

describe("PUT /api/settings makes the next leaderboard read fresh", () => {
  it("drops a player from the climb board on the next read after consent is revoked", async () => {
    const board = await warm(LEADERBOARD_CACHE_TAG, "with-player");
    board.set("without-player");
    // Control: without a save the cache still serves the warmed value.
    expect(await board.read()).toBe("with-player");

    const res = await save({ leaderboardConsent: false });
    expect(res.status).toBe(200);
    expect(await board.read()).toBe("without-player");
  });

  it("shows the new avatar on the climb board on the next read after an avatar save", async () => {
    const board = await warm(LEADERBOARD_CACHE_TAG, "avatar:none");
    board.set(`avatar:${AVATARS[0].id}`);

    const res = await save({ avatarId: AVATARS[0].id });
    expect(res.status).toBe(200);
    expect(await board.read()).toBe(`avatar:${AVATARS[0].id}`);
  });

  it("drops a player from the duel board on the next read after the display name is cleared", async () => {
    const board = await warm(DUEL_LEADERBOARD_CACHE_TAG, "named");
    board.set("unnamed");

    const res = await save({ displayName: null });
    expect(res.status).toBe(200);
    expect(await board.read()).toBe("unnamed");
  });

  it("leaves both boards cached on a save that changes neither", async () => {
    const climb = await warm(LEADERBOARD_CACHE_TAG, "climb-old");
    const duel = await warm(DUEL_LEADERBOARD_CACHE_TAG, "duel-old");
    climb.set("climb-new");
    duel.set("duel-new");

    const res = await save({ social: {} });
    expect(res.status).toBe(200);
    expect(await climb.read()).toBe("climb-old");
    expect(await duel.read()).toBe("duel-old");
  });
});
