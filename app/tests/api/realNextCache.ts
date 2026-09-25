/**
 * Next's REAL cache for route tests: an in-memory IncrementalCache backing
 * real unstable_cache entries, with each "request" run inside a work store and
 * its revalidateTag calls flushed the way Next flushes them at request end.
 *
 * Mocking revalidateTag and asserting its arguments cannot tell `{ expire: 0 }`
 * (immediate expiry) from `{ expire: 60 }` (stale-while-revalidate in Next 16,
 * which serves the old body once more). Asserting the next read's value can.
 *
 * Import "./nodeAsyncStorage" before this module (and before anything that
 * loads next/cache).
 */

import { expect } from "vitest";
import { unstable_cache } from "next/cache";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import FileSystemCache from "next/dist/server/lib/incremental-cache/file-system-cache";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { executeRevalidates } from "next/dist/server/revalidation-utils";

const CACHE_SECONDS = 60;
const MEMORY_CACHE_BYTES = 1_000_000;
// Next stamps entries and tag expiry in whole ms (Date.now), then compares with
// performance.timeOrigin + performance.now(). Letting a few ms pass between the
// warm-up, the write and the read keeps the test off that same-ms edge. It
// cannot hide stale-while-revalidate, which keeps the old body for 60s.
const CLOCK_SETTLE_MS = 5;

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, CLOCK_SETTLE_MS));
}

export function newIncrementalCache(): IncrementalCache {
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
export async function inRequest<T>(
  incrementalCache: IncrementalCache,
  route: string,
  fn: () => Promise<T>,
): Promise<T> {
  const partial: Partial<WorkStore> = {
    route,
    page: `${route}/route`,
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

/**
 * A board cached under `tag` whose source the test can change. The first read
 * warms the cache. Changing the source leaves the cached value in place, so
 * any read that sees the change came from a cache miss. `key` must be unique
 * per test so entries never leak between tests.
 */
export async function warmBoard(incrementalCache: IncrementalCache, tag: string, key: string, initial: string) {
  let source = initial;
  const read = unstable_cache(async () => source, [`board-${tag}-${key}`], {
    tags: [tag],
    revalidate: CACHE_SECONDS,
  });
  const readRoute = "/api/board";
  expect(await inRequest(incrementalCache, readRoute, read)).toBe(initial);
  await settle();
  return {
    set(next: string) {
      source = next;
    },
    async read() {
      await settle();
      return inRequest(incrementalCache, readRoute, read);
    },
  };
}
