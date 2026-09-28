/**
 * Level System extras (src/levels/rules.ts): Daily XP raised never summed,
 * the once-a-day bonus life, and the Daily's floor count.
 */

import { describe, expect, it } from "vitest";

import {
  DAILY_XP_MAX,
  LIFE_REFILL_MS,
  MAX_LIVES,
  bonusLife,
  dailyXpForFloors,
  raiseDailyXp,
} from "../../src/levels/rules";
import { dailyFloorsForPeak } from "../../src/game/dailyVerify";
import { buildFreeTower } from "../../src/game/freeStack";
import { applyRunSeed, floorHeight } from "../../src/game/towers";

const NOW = new Date("2026-09-28T12:00:00Z");
const TODAY = "2026-09-28";

describe("dailyXpForFloors", () => {
  it("pays the floor count, capped at 100", () => {
    expect(dailyXpForFloors(37)).toBe(37);
    expect(dailyXpForFloors(DAILY_XP_MAX + 50)).toBe(DAILY_XP_MAX);
  });

  it.each([[-4], [Number.NaN], [Number.POSITIVE_INFINITY]])("pays nothing for %d", (n) => {
    expect(dailyXpForFloors(n)).toBe(0);
  });
});

describe("raiseDailyXp", () => {
  it("pays the first run of a day in full", () => {
    expect(raiseDailyXp(null, 20)).toEqual({ amount: 20, delta: 20 });
  });

  it("raises to a better run and pays only the rise", () => {
    expect(raiseDailyXp(20, 35)).toEqual({ amount: 35, delta: 15 });
  });

  it("never sums or lowers: a worse or equal run pays nothing", () => {
    expect(raiseDailyXp(35, 20)).toEqual({ amount: 35, delta: 0 });
    expect(raiseDailyXp(35, 35)).toEqual({ amount: 35, delta: 0 });
  });

  it("stops at the cap", () => {
    expect(raiseDailyXp(90, 400)).toEqual({ amount: DAILY_XP_MAX, delta: 10 });
    expect(raiseDailyXp(DAILY_XP_MAX, 400)).toEqual({ amount: DAILY_XP_MAX, delta: 0 });
  });
});

describe("bonusLife", () => {
  const low = { lives: 2, updatedAt: new Date(NOW.getTime() - 10 * 60_000) };

  it("adds one life when not yet paid today", () => {
    expect(bonusLife(low, "2026-09-27", TODAY, NOW)).toEqual({ lives: 3, updatedAt: low.updatedAt });
    expect(bonusLife(low, null, TODAY, NOW)?.lives).toBe(3);
  });

  it("pays nothing twice in one UTC day", () => {
    expect(bonusLife(low, TODAY, TODAY, NOW)).toBeNull();
  });

  it("pays nothing at full lives, including after the refill, so the day's bonus is kept", () => {
    expect(bonusLife({ lives: MAX_LIVES, updatedAt: null }, null, TODAY, NOW)).toBeNull();
    const refilled = { lives: MAX_LIVES - 1, updatedAt: new Date(NOW.getTime() - LIFE_REFILL_MS) };
    expect(bonusLife(refilled, null, TODAY, NOW)).toBeNull();
  });

  it("never goes past the max", () => {
    const four = { lives: MAX_LIVES - 1, updatedAt: NOW };
    expect(bonusLife(four, null, TODAY, NOW)?.lives).toBe(MAX_LIVES);
  });
});

describe("dailyFloorsForPeak", () => {
  const seed = "daily-test-seed";
  const tower = applyRunSeed(buildFreeTower(), seed);

  it("counts the floor whose surface the peak reached", () => {
    expect(dailyFloorsForPeak(seed, floorHeight(tower, 7) + 0.1)).toBe(7);
    expect(dailyFloorsForPeak(seed, floorHeight(tower, 7) - 0.1)).toBe(6);
  });

  it("is 0 for no climb or a nonsense peak", () => {
    expect(dailyFloorsForPeak(seed, 0)).toBe(0);
    expect(dailyFloorsForPeak(seed, Number.NaN)).toBe(0);
    expect(dailyFloorsForPeak(seed, -3)).toBe(0);
  });
});
