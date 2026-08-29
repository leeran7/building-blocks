/**
 * Tower geometry must stay sub-linear per query.
 *
 * When floor gaps became per-floor seeded, floorHeight and floorIndexAt turned
 * into O(floor) loops that allocated a fresh RNG per floor. Geometry is queried
 * every tick, so per-frame cost grew with the player's score — the one thing an
 * endless climber cannot afford. It surfaced only as two suites going from
 * roughly 250ms to over 3s, because nothing in tests/** asserted cost at all.
 *
 * These count RNG constructions rather than measuring elapsed time. The number
 * of seeded RNGs built is the actual complexity quantity, and counting it is
 * deterministic: a wall-clock ratio for the same property was flaky at roughly
 * 1 run in 12 on this machine, and a flaky guard is worse than none.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildTower, floorHeight, floorIndexAt, floorGapForFloor } from "../../src/game/towers";
import { gapRngCount, resetRngCounts } from "./rngCounter";

vi.mock("../../src/game/rng", async () => {
  const actual = await vi.importActual<typeof import("../../src/game/rng")>(
    "../../src/game/rng"
  );
  const { recordRngSeed } = await import("./rngCounter");
  return {
    ...actual,
    createRng: (seed: string) => {
      recordRngSeed(seed);
      return actual.createRng(seed);
    },
  };
});

describe("floorHeight builds each floor's gap at most once", () => {
  beforeEach(() => {
    resetRngCounts();
  });

  it("scanning N floors costs O(N) gap draws, not O(N^2)", () => {
    const N = 2000;
    const tower = buildTower("ai", { runSeed: "linear-cost" });

    resetRngCounts();
    for (let i = 0; i <= N; i++) floorHeight(tower, i);

    // Memoized: one draw per floor. The unmemoized loop redraws every floor
    // below i on each call, which is N*(N+1)/2 — about 2,001,000 here.
    expect(gapRngCount()).toBeLessThanOrEqual(N + 1);
    expect(gapRngCount()).toBeGreaterThan(0);
  });

  it("a repeated deep query draws nothing the second time", () => {
    const tower = buildTower("ai", { runSeed: "warm-query" });

    floorHeight(tower, 5000);
    resetRngCounts();
    for (let i = 0; i < 50; i++) floorHeight(tower, 5000);

    expect(gapRngCount()).toBe(0);
  });

  it("doubling the depth doubles the draws rather than quadrupling them", () => {
    const near = drawsForScan("shape-near", 1000);
    const far = drawsForScan("shape-far", 2000);

    // Linear per query would make this ratio ~4.
    expect(far / near).toBeLessThan(2.5);
    expect(far / near).toBeGreaterThan(1.5);
  });

  it("repeated floorIndexAt queries high up the tower draw nothing", () => {
    const tower = buildTower("ai", { runSeed: "index-cost" });
    const y = floorHeight(tower, 3000);

    // The first call extends the prefix by one growth block, because y lands
    // exactly on the last cached entry and the search needs a strictly greater
    // bound above it. After that the range covers y.
    floorIndexAt(tower, y);

    resetRngCounts();
    for (let i = 0; i < 500; i++) floorIndexAt(tower, y);

    // A binary search over the cached prefix draws no RNG at all. The
    // unmemoized loop redrew every floor below y on each of the 500 calls.
    expect(gapRngCount()).toBe(0);
  });

  it("a cold floorIndexAt draws once per floor below the target", () => {
    const tower = buildTower("ai", { runSeed: "index-cold" });
    const reference = buildTower("ai", { runSeed: "index-cold" });
    let y = 0;
    for (let i = 0; i < 1000; i++) y += floorGapForFloor(reference, i);

    resetRngCounts();
    floorIndexAt(tower, y);

    // 1000 floors plus at most one growth block of overshoot.
    expect(gapRngCount()).toBeLessThanOrEqual(1000 + 64);
    expect(gapRngCount()).toBeGreaterThanOrEqual(1000);
  });
});

describe("floorHeight stays correct", () => {
  it("matches a naive cumulative sum exactly", () => {
    const tower = buildTower("ai", { runSeed: "naive-crosscheck" });
    let expected = 0;
    for (let i = 0; i < 300; i++) {
      expect(floorHeight(tower, i)).toBeCloseTo(expected, 9);
      expected += floorGapForFloor(tower, i);
    }
  });

  it("returns 0 at and below floor 0", () => {
    const tower = buildTower("ai");
    expect(floorHeight(tower, 0)).toBe(0);
    expect(floorHeight(tower, -5)).toBe(0);
  });

  it("is strictly increasing", () => {
    const tower = buildTower("ai", { runSeed: "monotonic" });
    for (let i = 1; i < 500; i++) {
      expect(floorHeight(tower, i)).toBeGreaterThan(floorHeight(tower, i - 1));
    }
  });
});

describe("floorIndexAt", () => {
  it("inverts floorHeight", () => {
    const tower = buildTower("ai", { runSeed: "inverse" });
    for (let i = 0; i < 400; i++) {
      // Exactly on the surface resolves to that floor.
      expect(floorIndexAt(tower, floorHeight(tower, i))).toBe(i);
      // Just under the next surface is still that floor.
      expect(floorIndexAt(tower, floorHeight(tower, i + 1) - 0.001)).toBe(i);
    }
  });

  it("clamps below the base floor", () => {
    const tower = buildTower("ai");
    expect(floorIndexAt(tower, -1)).toBe(0);
    expect(floorIndexAt(tower, 0)).toBe(0);
  });
});

describe("the geometry cache is bounded", () => {
  it("survives many distinct run seeds and still computes correctly", () => {
    // Tower seeds now mix in a per-run id, so an unbounded map retains one
    // growing array per game played. This would have held 400 of them.
    for (let run = 0; run < 400; run++) {
      const tower = buildTower("ai", { runSeed: `leak-probe-${run}` });
      floorHeight(tower, 200);
    }

    // A long-evicted tower must still compute the same heights from scratch.
    const revisited = buildTower("ai", { runSeed: "leak-probe-0" });
    let expected = 0;
    for (let i = 0; i < 200; i++) expected += floorGapForFloor(revisited, i);
    expect(floorHeight(revisited, 200)).toBeCloseTo(expected, 9);
  });
});

function drawsForScan(runSeed: string, floors: number): number {
  const tower = buildTower("ai", { runSeed });
  resetRngCounts();
  for (let i = 0; i <= floors; i++) floorHeight(tower, i);
  return gapRngCount();
}
