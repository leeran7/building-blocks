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

import { unstable_cache } from "next/cache";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import FileSystemCache from "next/dist/server/lib/incremental-cache/file-system-cache";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { executeRevalidates } from "next/dist/server/revalidation-utils";
import { PUT } from "../../app/api/settings/route";
import { LEADERBOARD_CACHE_TAG } from "../../src/db/climb";
import { DUEL_LEADERBOARD_CACHE_TAG } from "../../src/db/duel";
import { AVATARS } from "../../src/lib/avatars";

const CACHE_SECONDS = 60;
const MEMORY_CACHE_BYTES = 1_000_000;
// Next stamps entries and tag expiry in whole ms (Date.now), then compares with
// performance.timeOrigin + performance.now(). Letting a few ms pass between the
// warm-up, the save and the read keeps the test off that same-ms edge. It
// cannot hide stale-while-revalidate, which keeps the old body for 60s.
const CLOCK_SETTLE_MS = 5;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, CLOCK_SETTLE_MS));
}

function newIncrementalCache(): IncrementalCache {
  return new IncrementalCache({
    dev: false,
    flushToDisk: false,
    minimalMode: false,
    requestHeaders: {},
    maxMemoryCacheSize: MEMORY_CACHE_BYTES,
    fetchCacheKeyPrefix: "",
    CurCacheHandler: FileSystemCache,
    getPrerenderManifest: () => ({
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: { previewModeId: "test", previewModeSigningKey: "", previewModeEncryptionKey: "" },
    }),
  });
}

/**
 * Runs `fn` as one request would: inside a work store, then flushes the
 * revalidateTag calls and background revalidations queued during it.
 */
async function inRequest<T>(incrementalCache: IncrementalCache, fn: () => Promise<T>): Promise<T> {
  const partial: Partial<WorkStore> = {
    route: "/api/settings",
    page: "/api/settings/route",
    incrementalCache,
    isStaticGeneration: false,
    isOnDemandRevalidate: false,
    isDraftMode: false,
  };
  const store = partial as WorkStore;
  const result = await workAsyncStorage.run(store, fn);
  await executeRevalidates(store);
  await Promise.all(Object.values(store.pendingRevalidates ?? {}));
  return result;
}

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

/**
 * A board cached under `tag` whose source the test can change. The first read
 * warms the cache. Changing the source leaves the cached value in place, so
 * any read that sees the change came from a cache miss.
 */
async function warmBoard(tag: string, initial: string) {
  let source = initial;
  const read = unstable_cache(async () => source, [`board-${tag}-${run}`], {
    tags: [tag],
    revalidate: CACHE_SECONDS,
  });
  expect(await inRequest(incrementalCache, read)).toBe(initial);
  await settle();
  return {
    set(next: string) {
      source = next;
    },
    async read() {
      await settle();
      return inRequest(incrementalCache, read);
    },
  };
}

describe("PUT /api/settings makes the next leaderboard read fresh", () => {
  it("drops a player from the climb board on the next read after consent is revoked", async () => {
    const board = await warmBoard(LEADERBOARD_CACHE_TAG, "with-player");
    board.set("without-player");
    // Control: without a save the cache still serves the warmed value.
    expect(await board.read()).toBe("with-player");

    const res = await inRequest(incrementalCache, () => put({ leaderboardConsent: false }));
    expect(res.status).toBe(200);
    expect(await board.read()).toBe("without-player");
  });

  it("shows the new avatar on the climb board on the next read after an avatar save", async () => {
    const board = await warmBoard(LEADERBOARD_CACHE_TAG, "avatar:none");
    board.set(`avatar:${AVATARS[0].id}`);

    const res = await inRequest(incrementalCache, () => put({ avatarId: AVATARS[0].id }));
    expect(res.status).toBe(200);
    expect(await board.read()).toBe(`avatar:${AVATARS[0].id}`);
  });

  it("drops a player from the duel board on the next read after the display name is cleared", async () => {
    const board = await warmBoard(DUEL_LEADERBOARD_CACHE_TAG, "named");
    board.set("unnamed");

    const res = await inRequest(incrementalCache, () => put({ displayName: null }));
    expect(res.status).toBe(200);
    expect(await board.read()).toBe("unnamed");
  });

  it("leaves both boards cached on a save that changes neither", async () => {
    const climb = await warmBoard(LEADERBOARD_CACHE_TAG, "climb-old");
    const duel = await warmBoard(DUEL_LEADERBOARD_CACHE_TAG, "duel-old");
    climb.set("climb-new");
    duel.set("duel-new");

    const res = await inRequest(incrementalCache, () => put({ social: {} }));
    expect(res.status).toBe(200);
    expect(await climb.read()).toBe("climb-old");
    expect(await duel.read()).toBe("duel-old");
  });
});
