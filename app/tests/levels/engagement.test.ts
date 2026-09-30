/**
 * Level engagement rules (src/levels/engagement.ts): win streaks, stuck help,
 * the free start power-up, booster parsing and star chests. Every guard is
 * proven against an input it must reject.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  BOOSTER_TYPES,
  ROUTE_GHOST_FAILS,
  STARS_PER_CHEST,
  boosterInventory,
  chestBoostersFromRoll,
  chestProgress,
  chestsEarned,
  STREAK_RAPID_CLIMB,
  STREAK_SUPER_JUMP,
  STUCK_BOOSTER_FAILS,
  boosterTypesOf,
  failsAt,
  freeStartPowerUp,
  nextFailTally,
  nextStreak,
  routeGhostAvailable,
  stuckHelpPowerUp,
  parseBoosterType,
  streakPowerUp,
  type BoosterType,
  EARLY_START_LAST_LEVEL,
  startBoosterTypes,
} from "../../src/levels/engagement";
import { levelBoosterTypes } from "../../src/levels/catalog";
import {
  STAR_CHEST_SECRET_MIN_LENGTH,
  TEST_STAR_CHEST_SECRET,
  rollStarChest,
  starChestRoll,
  starChestSecret,
} from "../../src/levels/starChestServer";

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
    expect(levelBoosterTypes(1, 42)).toEqual(ALL.filter((t) => t !== "super-jump" && t !== "jetpack"));
    expect(levelBoosterTypes(1, 46)).toEqual(ALL);
    expect(levelBoosterTypes(1, 301)).toBeNull();
    expect(levelBoosterTypes(2, 1)).toBeNull();
  });
});

describe("startBoosterTypes", () => {
  const ALLOWED = [...ALL, "random" as const];

  it("keeps super jump, jetpack and random out of early-level starts", () => {
    for (const level of [1, 11, 28, 42, EARLY_START_LAST_LEVEL]) {
      const types = startBoosterTypes(level, ALLOWED);
      expect(types).not.toContain("super-jump");
      expect(types).not.toContain("jetpack");
      expect(types).not.toContain("random");
      expect(types).toContain("rapid-climb");
    }
  });

  it("allows them from the first level past the early game", () => {
    expect(startBoosterTypes(EARLY_START_LAST_LEVEL + 1, ALLOWED)).toEqual(ALL);
  });

  it("means an early streak earns the rapid climb and stuck help skips the late boosters", () => {
    const early = startBoosterTypes(EARLY_START_LAST_LEVEL, ALLOWED);
    expect(streakPowerUp(STREAK_SUPER_JUMP, early)).toBe("rapid-climb");
    for (let fails = STUCK_BOOSTER_FAILS; fails < STUCK_BOOSTER_FAILS + 14; fails++) {
      expect(["super-jump", "jetpack"]).not.toContain(stuckHelpPowerUp(fails, early));
    }
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
    expect(freeStartPowerUp({ atFrontier: true, streak: 3, fails: 0, allowed: EARLY })).toEqual({
      type: "rapid-climb",
      source: "streak",
    });
  });

  it("never grants on a replay", () => {
    expect(freeStartPowerUp({ atFrontier: false, streak: 9, fails: 0, allowed: ALL })).toBeNull();
    expect(freeStartPowerUp({ atFrontier: false, streak: 0, fails: 9, allowed: ALL })).toBeNull();
  });

  it("grants stuck help after 3 fails, and the streak takes precedence", () => {
    expect(freeStartPowerUp({ atFrontier: true, streak: 0, fails: 2, allowed: ALL })).toBeNull();
    expect(freeStartPowerUp({ atFrontier: true, streak: 0, fails: 3, allowed: ALL })).toEqual({
      type: "slow-lava",
      source: "stuck_help",
    });
    expect(freeStartPowerUp({ atFrontier: true, streak: 3, fails: 3, allowed: ALL })).toEqual({
      type: "rapid-climb",
      source: "streak",
    });
  });
});

describe("nextFailTally", () => {
  const L7 = { season: 1, level: 7 };

  it("counts fails and abandoned tickets at the frontier level", () => {
    let t = nextFailTally(null, L7, "failed", true);
    expect(t).toEqual({ season: 1, level: 7, count: 1 });
    t = nextFailTally(t, L7, "abandoned", true);
    expect(t).toEqual({ season: 1, level: 7, count: 2 });
  });

  it("resets on a clear at the frontier", () => {
    expect(nextFailTally({ season: 1, level: 7, count: 4 }, L7, "cleared", true)).toBeNull();
  });

  it("starts over when the stored tally is for another level or season", () => {
    expect(nextFailTally({ season: 1, level: 6, count: 4 }, L7, "failed", true)).toEqual({ season: 1, level: 7, count: 1 });
    expect(nextFailTally({ season: 2, level: 7, count: 4 }, L7, "failed", true)).toEqual({ season: 1, level: 7, count: 1 });
  });

  it("ignores replays and bad starts", () => {
    const t = { season: 1, level: 7, count: 2 };
    expect(nextFailTally(t, { season: 1, level: 3 }, "failed", false)).toBe(t);
    expect(nextFailTally(t, { season: 1, level: 3 }, "cleared", false)).toBe(t);
    expect(nextFailTally(t, L7, "bad_start", true)).toBe(t);
  });

  it("reads fails only for the tally's own level", () => {
    const t = { season: 1, level: 7, count: 3 };
    expect(failsAt(t, 1, 7)).toBe(3);
    expect(failsAt(t, 1, 8)).toBe(0);
    expect(failsAt(t, 2, 7)).toBe(0);
    expect(failsAt(null, 1, 7)).toBe(0);
  });
});

describe("stuckHelpPowerUp", () => {
  it("grants nothing before 3 fails", () => {
    expect(stuckHelpPowerUp(STUCK_BOOSTER_FAILS - 1, ALL)).toBeNull();
  });

  it("rotates through the allowed types, deterministically", () => {
    expect(stuckHelpPowerUp(3, ALL)).toBe("slow-lava");
    expect(stuckHelpPowerUp(4, ALL)).toBe("super-jump");
    expect(stuckHelpPowerUp(3 + 7, ALL)).toBe("slow-lava");
    expect(stuckHelpPowerUp(3, EARLY)).toBe("rapid-climb");
    expect(stuckHelpPowerUp(4, EARLY)).toBe("sprint-burst");
    expect(stuckHelpPowerUp(5, EARLY)).toBe("rapid-climb");
  });

  it("grants nothing on a level with no power-ups", () => {
    expect(stuckHelpPowerUp(9, [])).toBeNull();
  });

  it("offers the route ghost from 5 fails", () => {
    expect(routeGhostAvailable(ROUTE_GHOST_FAILS - 1)).toBe(false);
    expect(routeGhostAvailable(ROUTE_GHOST_FAILS)).toBe(true);
  });
});

describe("star chests", () => {
  it("earns one chest per 20 lifetime stars", () => {
    expect(chestsEarned(19)).toBe(0);
    expect(chestsEarned(STARS_PER_CHEST)).toBe(1);
    expect(chestsEarned(59)).toBe(2);
    expect(chestsEarned(-5)).toBe(0);
    expect(chestProgress(47)).toEqual({ starsIntoChest: 7, perChest: 20, earned: 2 });
  });

  it("maps a roll onto 1 or 2 boosters from the pool", () => {
    const roll = new Uint8Array(32);
    roll[0] = 1; // two boosters
    roll.set([0, 0, 0, 5], 4); // 5 % 3 = 2
    roll.set([0, 0, 1, 0], 8); // 256 % 3 = 1
    expect(chestBoostersFromRoll(roll, ["rapid-climb", "sprint-burst", "giant"])).toEqual(["giant", "sprint-burst"]);
    roll[0] = 2; // one booster
    expect(chestBoostersFromRoll(roll, ["rapid-climb", "sprint-burst", "giant"])).toEqual(["giant"]);
  });

  it("gives nothing for an empty pool or a short roll, so the chest stays closed", () => {
    expect(chestBoostersFromRoll(new Uint8Array(32), [])).toEqual([]);
    expect(chestBoostersFromRoll(new Uint8Array(8), ALL)).toEqual([]);
  });

  it("rolls deterministically per (secret, user, chest)", () => {
    const a = rollStarChest(TEST_STAR_CHEST_SECRET, "user-a", 1, ALL);
    expect(rollStarChest(TEST_STAR_CHEST_SECRET, "user-a", 1, ALL)).toEqual(a);
    expect(a.length === 1 || a.length === 2).toBe(true);
    for (const t of a) expect(BOOSTER_TYPES).toContain(t);
    const roll = starChestRoll(TEST_STAR_CHEST_SECRET, "user-a", 1);
    expect(Buffer.from(roll).equals(Buffer.from(starChestRoll(TEST_STAR_CHEST_SECRET, "user-a", 2)))).toBe(false);
    expect(Buffer.from(roll).equals(Buffer.from(starChestRoll(TEST_STAR_CHEST_SECRET, "user-b", 1)))).toBe(false);
    expect(Buffer.from(roll).equals(Buffer.from(starChestRoll("another-secret-of-thirty-two-chars!!", "user-a", 1)))).toBe(false);
  });

  it("is HMAC-SHA256(secret, `${userId}:${chestNumber}`)", () => {
    const expected = createHmac("sha256", "k".repeat(40)).update("u9:3").digest();
    expect(Buffer.from(starChestRoll("k".repeat(40), "u9", 3)).equals(expected)).toBe(true);
  });

  it("fails closed in production without a sound secret, and uses the test secret elsewhere", () => {
    const good = "s".repeat(STAR_CHEST_SECRET_MIN_LENGTH);
    expect(starChestSecret({ NODE_ENV: "production", STAR_CHEST_SECRET: good })).toBe(good);
    expect(starChestSecret({ NODE_ENV: "production" })).toBeNull();
    expect(starChestSecret({ NODE_ENV: "production", STAR_CHEST_SECRET: "short" })).toBeNull();
    expect(starChestSecret({ NODE_ENV: "test" })).toBe(TEST_STAR_CHEST_SECRET);
    expect(starChestSecret({ NODE_ENV: "development", STAR_CHEST_SECRET: good })).toBe(good);
    // Any other deploy (a staging `next start`, an unset NODE_ENV) fails closed.
    expect(starChestSecret({ NODE_ENV: "staging" })).toBeNull();
    expect(starChestSecret({})).toBeNull();
  });

  it("reads an inventory, dropping unknown types and empty counts", () => {
    expect(
      boosterInventory([
        { type: "giant", count: 2 },
        { type: "random", count: 4 },
        { type: "toString", count: 1 },
        { type: "jetpack", count: 0 },
      ])
    ).toEqual({ giant: 2 });
  });
});
