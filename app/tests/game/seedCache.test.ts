/**
 * createSeedCache — the bound is the point.
 *
 * Two geometry caches were plain Maps keyed by tower seed. That was fine while
 * seeds were stable per category, but seeds now mix in a fresh newRunSeed() per
 * run, so each game played added a permanently retained entry whose value grows
 * with the altitude reached.
 */

import { describe, it, expect } from "vitest";
import { createSeedCache } from "../../src/game/seedCache";

describe("createSeedCache", () => {
  it("returns the same instance for a repeated seed", () => {
    const cache = createSeedCache<number[]>(4, () => []);

    const first = cache.get("a");
    first.push(1);

    expect(cache.get("a")).toBe(first);
    expect(cache.get("a")).toEqual([1]);
  });

  it("builds a separate instance per seed", () => {
    const cache = createSeedCache<number[]>(4, () => []);

    expect(cache.get("a")).not.toBe(cache.get("b"));
  });

  it("never exceeds its limit, however many seeds arrive", () => {
    const cache = createSeedCache<number[]>(8, () => []);

    for (let i = 0; i < 5000; i++) cache.get(`run-${i}`);

    expect(cache.size).toBe(8);
  });

  it("evicts the least recently used seed", () => {
    const cache = createSeedCache<number[]>(2, () => []);

    cache.get("a").push(1);
    cache.get("b").push(2);
    // Touching "a" makes "b" the oldest.
    expect(cache.get("a")).toEqual([1]);
    cache.get("c");

    // "b" was evicted, so it is rebuilt empty; "a" survived.
    expect(cache.get("a")).toEqual([1]);
    expect(cache.get("b")).toEqual([]);
  });

  it("rebuilds an evicted seed rather than returning stale data", () => {
    const cache = createSeedCache<number[]>(1, () => []);

    cache.get("a").push(1);
    cache.get("b");

    expect(cache.get("a")).toEqual([]);
  });

  it("counts a rebuild as a fresh build", () => {
    let builds = 0;
    const cache = createSeedCache<number[]>(1, () => {
      builds += 1;
      return [];
    });

    cache.get("a");
    cache.get("a");
    expect(builds).toBe(1);

    cache.get("b");
    cache.get("a");
    expect(builds).toBe(3);
  });

  it("clears everything", () => {
    const cache = createSeedCache<number[]>(4, () => []);
    cache.get("a");
    cache.get("b");

    cache.clear();

    expect(cache.size).toBe(0);
  });
});
