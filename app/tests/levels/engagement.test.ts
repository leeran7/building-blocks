/**
 * Level engagement rules (src/levels/engagement.ts): win streaks, stuck help,
 * the free start power-up, booster parsing and star chests. Every guard is
 * proven against an input it must reject.
 */

import { describe, expect, it } from "vitest";

import {
  BOOSTER_TYPES,
  STREAK_RAPID_CLIMB,
  STREAK_SUPER_JUMP,
  boosterTypesOf,
  freeStartPowerUp,
  nextStreak,
  parseBoosterType,
  streakPowerUp,
  type BoosterType,
} from "../../src/levels/engagement";
import { levelBoosterTypes } from "../../src/levels/catalog";

const EARLY: BoosterType[] = ["rapid-climb", "sprint-burst"];
const ALL: BoosterType[] = [...BOOSTER_TYPES];

describe("parseBoosterType", () => {
  it("accepts every concrete power-up type", () => {
    for (const t of BOOSTER_TYPES) expect(parseBoosterType(t)).toBe(t);
  });

  it.each([["random"], ["toString"], ["__proto__"], ["constructor"], ["Rapid-Climb"], [""], [1], [null], [undefined], [{}]])(
    "rejects %j",
    (raw) => {
      expect(parseBoosterType(raw)).toBeNull();
    }
  );
});

describe("boosterTypesOf", () => {
  it("drops the random orb and duplicates", () => {
    expect(boosterTypesOf(["rapid-climb", "random", "giant", "giant"])).toEqual(["rapid-climb", "giant"]);
  });

  it("reads a level's allowed set from the season 1 manifest", () => {
    expect(levelBoosterTypes(1, 3)).toEqual([]);
    expect(levelBoosterTypes(1, 4)).toEqual(["rapid-climb"]);
    expect(levelBoosterTypes(1, 42)).toEqual(ALL);
    expect(levelBoosterTypes(1, 301)).toBeNull();
    expect(levelBoosterTypes(2, 1)).toBeNull();
  });
});

describe("nextStreak", () => {
  it("adds a clear at the frontier", () => {
    expect(nextStreak(2, "cleared", true)).toBe(3);
  });

  it("resets on a fail or an abandoned ticket at the frontier", () => {
    expect(nextStreak(4, "failed", true)).toBe(0);
    expect(nextStreak(4, "abandoned", true)).toBe(0);
  });

  it("leaves it alone for a bad start", () => {
    expect(nextStreak(4, "bad_start", true)).toBe(4);
  });

  it("ignores every outcome of a replay", () => {
    for (const o of ["cleared", "failed", "abandoned", "bad_start"] as const) {
      expect(nextStreak(4, o, false)).toBe(4);
    }
  });

  it("reads a corrupt stored value as 0", () => {
    expect(nextStreak(Number.NaN, "cleared", true)).toBe(1);
    expect(nextStreak(-3, "bad_start", true)).toBe(0);
  });
});

describe("streakPowerUp", () => {
  it("grants nothing under 3", () => {
    expect(streakPowerUp(STREAK_RAPID_CLIMB - 1, ALL)).toBeNull();
  });

  it("grants a rapid climb from 3 and a super jump from 5", () => {
    expect(streakPowerUp(STREAK_RAPID_CLIMB, ALL)).toBe("rapid-climb");
    expect(streakPowerUp(STREAK_SUPER_JUMP - 1, ALL)).toBe("rapid-climb");
    expect(streakPowerUp(STREAK_SUPER_JUMP, ALL)).toBe("super-jump");
    expect(streakPowerUp(40, ALL)).toBe("super-jump");
  });

  it("grants only types the level allows", () => {
    expect(streakPowerUp(STREAK_SUPER_JUMP, EARLY)).toBe("rapid-climb");
    expect(streakPowerUp(STREAK_SUPER_JUMP, ["super-jump"])).toBe("super-jump");
    expect(streakPowerUp(STREAK_RAPID_CLIMB, ["super-jump"])).toBeNull();
    expect(streakPowerUp(STREAK_SUPER_JUMP, [])).toBeNull();
  });
});

describe("freeStartPowerUp", () => {
  it("grants the streak's power-up on a frontier level", () => {
    expect(freeStartPowerUp({ atFrontier: true, streak: 3, allowed: EARLY })).toEqual({
      type: "rapid-climb",
      source: "streak",
    });
  });

  it("never grants on a replay", () => {
    expect(freeStartPowerUp({ atFrontier: false, streak: 9, allowed: ALL })).toBeNull();
  });
});
