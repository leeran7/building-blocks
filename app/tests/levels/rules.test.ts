/**
 * Level System rules (src/levels/rules.ts): lives refill, stars, XP and
 * player level, against the numbers in design/xp-and-levels.md §4 and §5.
 */

import { describe, expect, it } from "vitest";

import {
  EPISODE_XP,
  LIFE_REFILL_MS,
  MAX_LIVES,
  STAR_XP,
  episodeLevels,
  episodeOf,
  firstClearXp,
  isBadStart,
  isQuickRestart,
  isHardLevel,
  isLevelNumber,
  levelCostsLife,
  nextLifeAt,
  playerLevelForXp,
  playerLevelProgress,
  refillLives,
  refundLife,
  spendLife,
  parseReportedRun,
  runFitsWallClock,
  MAX_RUN_TICKS,
  xpAwardsForClear,
  xpToNextLevel,
} from "../../src/levels/rules";

const T0 = new Date("2026-09-27T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("lives", () => {
  it("L1-10 are free and L11 costs a life", () => {
    expect(levelCostsLife(1)).toBe(false);
    expect(levelCostsLife(10)).toBe(false);
    expect(levelCostsLife(11)).toBe(true);
  });

  it("spending from full starts the timer now", () => {
    expect(spendLife({ lives: 5, updatedAt: null }, T0)).toEqual({ lives: 4, updatedAt: T0 });
    expect(spendLife({ lives: 5, updatedAt: at(-500) }, T0)).toEqual({ lives: 4, updatedAt: T0 });
  });

  it("spending below full keeps the running timer", () => {
    expect(spendLife({ lives: 3, updatedAt: at(-10) }, T0)).toEqual({ lives: 2, updatedAt: at(-10) });
  });

  it("refills one life per 30 minutes and keeps partial time (§5b example)", () => {
    // 45 minutes after dropping to 3: one life back, the next 15 minutes away.
    const state = refillLives({ lives: 3, updatedAt: T0 }, at(45));
    expect(state).toEqual({ lives: 4, updatedAt: at(30) });
    expect(nextLifeAt(state, at(45))).toEqual(at(60));
  });

  it("never refills past MAX_LIVES", () => {
    expect(refillLives({ lives: 1, updatedAt: T0 }, at(10 * 60)).lives).toBe(MAX_LIVES);
    expect(nextLifeAt({ lives: 1, updatedAt: T0 }, at(10 * 60))).toBeNull();
  });

  it("refuses to spend at 0 lives until a life comes back", () => {
    expect(spendLife({ lives: 0, updatedAt: T0 }, at(29))).toBeNull();
    expect(spendLife({ lives: 0, updatedAt: T0 }, at(30))).toEqual({ lives: 0, updatedAt: at(30) });
  });

  it("a future timer (clock skew) grants nothing", () => {
    expect(refillLives({ lives: 2, updatedAt: at(90) }, T0)).toEqual({ lives: 2, updatedAt: at(90) });
  });

  it("clamps a corrupt stored count into 0..MAX_LIVES", () => {
    expect(refillLives({ lives: 99, updatedAt: null }, T0).lives).toBe(MAX_LIVES);
    expect(refillLives({ lives: -4, updatedAt: null }, T0).lives).toBe(0);
  });

  it("refund adds one life, capped, after the refill", () => {
    expect(refundLife({ lives: 4, updatedAt: T0 }, at(1))).toEqual({ lives: 5, updatedAt: T0 });
    expect(refundLife({ lives: 5, updatedAt: T0 }, at(1)).lives).toBe(5);
    expect(refundLife({ lives: 3, updatedAt: T0 }, at(31))).toEqual({ lives: 5, updatedAt: at(30) });
  });

  it("a bad start must end within 3 s of GO and be submitted promptly", () => {
    expect(isBadStart(60, T0, new Date(T0.getTime() + 10_000))).toBe(true);
    expect(isBadStart(90, T0, new Date(T0.getTime() + 10_000))).toBe(false);
    expect(isBadStart(-1, T0, T0)).toBe(false);
    // A ticket played locally for minutes, then submitted as a short log.
    expect(isBadStart(60, T0, at(5))).toBe(false);
    expect(isBadStart(60, T0, new Date(T0.getTime() + 3_000 + 2_000 + 5_000))).toBe(true);
    expect(isBadStart(60, T0, new Date(T0.getTime() + 3_000 + 2_000 + 5_001))).toBe(false);
    expect(isBadStart(89, T0, T0)).toBe(true);
  });

  it("a restart closes the old ticket as a bad start only within the window", () => {
    expect(isQuickRestart(T0, new Date(T0.getTime() + 11_000))).toBe(true);
    expect(isQuickRestart(T0, new Date(T0.getTime() + 11_001))).toBe(false);
  });

  it("LIFE_REFILL_MS is 30 minutes", () => {
    expect(LIFE_REFILL_MS).toBe(30 * 60 * 1000);
  });
});

describe("levels and episodes", () => {
  it("every 5th level is Hard", () => {
    expect([1, 4, 5, 10, 11, 300].map(isHardLevel)).toEqual([false, false, true, true, false, true]);
  });

  it("accepts only integers 1..300 as level numbers", () => {
    expect(isLevelNumber(1)).toBe(true);
    expect(isLevelNumber(300)).toBe(true);
    for (const bad of [0, 301, 1.5, -1, Number.NaN, "5", null]) expect(isLevelNumber(bad)).toBe(false);
  });

  it("episodes are 15 levels", () => {
    expect(episodeOf(1)).toBe(1);
    expect(episodeOf(15)).toBe(1);
    expect(episodeOf(16)).toBe(2);
    expect(episodeLevels(2)).toEqual({ first: 16, last: 30 });
  });
});

describe("reported runs", () => {
  it("accepts a consistent clear or fail", () => {
    expect(parseReportedRun({ cleared: true, stars: 3, ticks: 900 })).toEqual({ cleared: true, stars: 3, ticks: 900 });
    expect(parseReportedRun({ cleared: false, stars: 0, ticks: 0 })).toEqual({ cleared: false, stars: 0, ticks: 0 });
    expect(parseReportedRun({ cleared: true, stars: 1, ticks: MAX_RUN_TICKS })).not.toBeNull();
  });

  it.each([
    [{ cleared: true, stars: 0, ticks: 900 }],
    [{ cleared: false, stars: 2, ticks: 900 }],
    [{ cleared: true, stars: 4, ticks: 900 }],
    [{ cleared: true, stars: 2.5, ticks: 900 }],
    [{ cleared: true, stars: "3", ticks: 900 }],
    [{ cleared: true, stars: 3, ticks: 0 }],
    [{ cleared: true, stars: 3, ticks: -1 }],
    [{ cleared: true, stars: 3, ticks: 10.5 }],
    [{ cleared: true, stars: 3, ticks: MAX_RUN_TICKS + 1 }],
    [{ cleared: "yes", stars: 3, ticks: 900 }],
    [{ stars: 3, ticks: 900 }],
    [{ cleared: true, stars: 3 }],
  ])("refuses %j", (raw) => {
    expect(parseReportedRun(raw)).toBeNull();
  });

  it("a run must fit the time since its ticket (3 s countdown + run, 5 s slack)", () => {
    // 300 ticks = 10 s of play + 3 s countdown = 13 s; 8 s + 5 s slack fits.
    expect(runFitsWallClock(300, T0, new Date(T0.getTime() + 8_000))).toBe(true);
    expect(runFitsWallClock(300, T0, new Date(T0.getTime() + 7_999))).toBe(false);
    expect(runFitsWallClock(MAX_RUN_TICKS, T0, at(1))).toBe(false);
  });
});

describe("XP and player level", () => {
  it("first clear pays 50 + 5N, doubled on Hard levels", () => {
    expect(firstClearXp(1)).toBe(55);
    expect(firstClearXp(4)).toBe(70);
    expect(firstClearXp(5)).toBe(150);
    expect(firstClearXp(300)).toBe(3100);
  });

  it("level steps cost round(60 * L^1.35)", () => {
    expect(xpToNextLevel(1)).toBe(60);
    expect(xpToNextLevel(2)).toBe(153);
    expect(xpToNextLevel(10)).toBe(1343);
  });

  it("player level starts at 1 and rises exactly at each threshold", () => {
    expect(playerLevelForXp(0)).toBe(1);
    expect(playerLevelForXp(59)).toBe(1);
    expect(playerLevelForXp(60)).toBe(2);
    const toThree = xpToNextLevel(1) + xpToNextLevel(2);
    expect(playerLevelForXp(toThree - 1)).toBe(2);
    expect(playerLevelProgress(toThree + 7)).toEqual({ level: 3, xpIntoLevel: 7, xpForNextLevel: xpToNextLevel(3) });
  });

  it("a corrupt XP total is treated as 0", () => {
    expect(playerLevelForXp(-50)).toBe(1);
    expect(playerLevelForXp(Number.NaN)).toBe(1);
  });

  it("a clear lists first-clear, one key per star, and the episode when done", () => {
    expect(xpAwardsForClear(1, 5, 2, false)).toEqual([
      { source: "first_clear", key: "first_clear:1:5", amount: 150 },
      { source: "star", key: "star:1:5:1", amount: STAR_XP },
      { source: "star", key: "star:1:5:2", amount: STAR_XP },
    ]);
    expect(xpAwardsForClear(2, 15, 3, true).at(-1)).toEqual({
      source: "episode",
      key: "episode:2:1",
      amount: EPISODE_XP,
    });
    expect(xpAwardsForClear(1, 5, 0, true)).toEqual([]);
  });
});
