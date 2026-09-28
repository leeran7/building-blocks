/**
 * Near-miss retries (design §6.2, mobile/src/lib/levels/nearMiss.ts): how
 * close a lost run came, and the device-local best failed height per level.
 */

import { describe, expect, it } from "vitest";

import {
  NEAR_MISS_FRACTION,
  bestFailMarker,
  createBestFailStore,
  floorsShort,
  isNearMiss,
  nearMissHeadline,
  parseBestFails,
} from "../../mobile/src/lib/levels/nearMiss";
import { levelRunSetup, season1Catalog } from "../../mobile/src/lib/levels/catalog";
import { floorHeight, summitFloor } from "../../src/game/towers";

function level(n: number) {
  const tower = levelRunSetup(n).tower;
  const goal = season1Catalog().level(n).goalFt;
  const summit = summitFloor(tower);
  if (summit === null) throw new Error("level tower has no summit");
  return { tower, goal, summit, floorFt: (i: number) => floorHeight(tower, i) };
}

describe("floorsShort and isNearMiss", () => {
  const L12 = level(12);

  it("counts floors from the floor a run peaked on to the summit", () => {
    expect(floorsShort(L12.tower, L12.floorFt(L12.summit - 1) + 0.5, L12.goal)).toBe(1);
    expect(floorsShort(L12.tower, L12.floorFt(L12.summit - 3) + 0.5, L12.goal)).toBe(3);
    expect(floorsShort(L12.tower, L12.goal, L12.goal)).toBe(0);
  });

  it("is close one floor below the summit, even when that is more than 10%", () => {
    const peak = L12.floorFt(L12.summit - 1) + 0.1;
    expect(L12.goal - peak).toBeGreaterThan(NEAR_MISS_FRACTION * L12.goal);
    expect(isNearMiss(L12.tower, peak, L12.goal)).toBe(true);
    expect(nearMissHeadline(L12.tower, peak, L12.goal)).toBe("1 floor from the summit!");
  });

  it("is close within 10% of the goal, even two floors down", () => {
    const L40 = level(40);
    const peak = L40.goal * (1 - NEAR_MISS_FRACTION) + 0.5;
    expect(floorsShort(L40.tower, peak, L40.goal)).toBeGreaterThanOrEqual(2);
    expect(isNearMiss(L40.tower, peak, L40.goal)).toBe(true);
    expect(nearMissHeadline(L40.tower, peak, L40.goal)).toMatch(/^\d+ floors from the summit!$/);
  });

  it("is not close two floors and more than 10% down", () => {
    const peak = L12.floorFt(L12.summit - 2) + 0.1;
    expect(floorsShort(L12.tower, peak, L12.goal)).toBe(2);
    expect(L12.goal - peak).toBeGreaterThan(NEAR_MISS_FRACTION * L12.goal);
    expect(isNearMiss(L12.tower, peak, L12.goal)).toBe(false);
    expect(nearMissHeadline(L12.tower, peak, L12.goal)).toBeNull();
  });

  it("never calls a clear or a nonsense height a near miss", () => {
    expect(isNearMiss(L12.tower, L12.goal, L12.goal)).toBe(false);
    expect(isNearMiss(L12.tower, Number.NaN, L12.goal)).toBe(false);
    expect(isNearMiss(L12.tower, 10, 0)).toBe(false);
  });
});

describe("best failed height store", () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      data,
      load: (k: string) => data.get(k) ?? null,
      save: (k: string, v: string) => void data.set(k, v),
    };
  }

  it("keeps the best per level, per account, and forgets a cleared level", () => {
    const m = memory();
    const store = createBestFailStore({ accountId: "u1", load: m.load, save: m.save });
    store.record(12, 150);
    store.record(12, 120);
    store.record(12, 190.5);
    expect(store.get(12)).toBe(190.5);
    expect(store.get(13)).toBeNull();
    expect(createBestFailStore({ accountId: "u2", load: m.load, save: m.save }).get(12)).toBeNull();
    expect(createBestFailStore({ accountId: "u1", load: m.load, save: m.save }).get(12)).toBe(190.5);
    store.clear(12);
    expect(store.get(12)).toBeNull();
  });

  it("ignores bad heights and levels", () => {
    const m = memory();
    const store = createBestFailStore({ load: m.load, save: m.save });
    store.record(0, 50);
    store.record(3, Number.NaN);
    store.record(3, -1);
    expect(m.data.size).toBe(0);
  });

  it("survives storage that is missing or throws (localStorage wrapped in try/catch)", () => {
    // No localStorage in this environment: reading it throws a ReferenceError.
    const store = createBestFailStore();
    expect(() => store.record(4, 10)).not.toThrow();
    expect(store.get(4)).toBe(10);
    expect(createBestFailStore().get(4)).toBeNull();
  });

  it.each([
    ["not json", "{"],
    ["an array", "[1,2]"],
    ["a prototype key", '{"__proto__": 5}'],
    ["a zero level", '{"0": 5}'],
    ["a string height", '{"3": "5"}'],
    ["a negative height", '{"3": -5}'],
  ])("drops %s", (_, raw) => {
    expect(parseBestFails(raw)).toEqual({});
  });

  it("marks the next try only when the best came close", () => {
    const L12 = level(12);
    const close = L12.floorFt(L12.summit - 1) + 0.1;
    const far = L12.floorFt(L12.summit - 3);
    expect(bestFailMarker(L12.tower, close, L12.goal)).toBe(close);
    expect(bestFailMarker(L12.tower, far, L12.goal)).toBeNull();
    expect(bestFailMarker(L12.tower, null, L12.goal)).toBeNull();
  });
});
