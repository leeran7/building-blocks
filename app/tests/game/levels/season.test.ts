/**
 * Season equation and level settings (design doc §3, §3a, §3d). The table
 * values are the design doc's season 1 column, rounded as printed there.
 */

import { describe, it, expect } from "vitest";
import {
  LEVELS_PER_SEASON,
  SEASON_1,
  dialAt,
  isHardLevel,
  seasonSpecProblems,
  stepCount,
  type SeasonSpec,
} from "../../../src/game/levels/season";
import { levelSpec, levelPars, levelHazard, levelTower, maxLavaMeanFrac } from "../../../src/game/levels/levelSpec";
import { ladderHangM, ladderTopGapM, summitFloor } from "../../../src/game/towers";
import { hazardMeanSpeedFrac } from "../../../src/game/hazard";

const TABLE: Array<[number, number, number, number]> = [
  // level, lava d, layout dL, goal ft
  [1, 0.0, 0.1, 72],
  [5, 0.08, 0.26, 151],
  [10, 0.12, 0.32, 197],
  [20, 0.19, 0.4, 267],
  [50, 0.34, 0.54, 414],
  [100, 0.52, 0.68, 592],
  [150, 0.66, 0.78, 736],
  [200, 0.78, 0.86, 862],
  [300, 1.0, 1.0, 1080],
];

describe("season equation", () => {
  it("counts Hard levels as three steps", () => {
    expect(stepCount(1)).toBe(0);
    expect(stepCount(4)).toBe(3);
    expect(stepCount(5)).toBe(6);
    // The design doc prints e(300) = 418; 299 + 2·60 is 419. p(300) = 1 either way.
    expect(stepCount(LEVELS_PER_SEASON)).toBe(419);
    expect(isHardLevel(5)).toBe(true);
    expect(isHardLevel(6)).toBe(false);
  });

  it.each(TABLE)("L%i matches the design table", (level, d, dL, goal) => {
    expect(dialAt(SEASON_1.lava, level)).toBeCloseTo(d, 2);
    expect(dialAt(SEASON_1.layout, level)).toBeCloseTo(dL, 2);
    expect(levelSpec(SEASON_1, level).goalFt).toBeGreaterThan(goal - 1.5);
    expect(levelSpec(SEASON_1, level).goalFt).toBeLessThan(goal + 1.5);
  });

  it("makes every level strictly harder than the one before", () => {
    let checked = 0;
    for (let n = 2; n <= LEVELS_PER_SEASON; n++) {
      const a = levelSpec(SEASON_1, n - 1);
      const b = levelSpec(SEASON_1, n);
      expect(b.goalFt).toBeGreaterThan(a.goalFt);
      expect(b.layoutDial).toBeGreaterThan(a.layoutDial);
      expect(b.tightness).toBeGreaterThan(a.tightness);
      expect(b.layout.gapFrac).toBeGreaterThan(a.layout.gapFrac);
      if (a.powerUpChance > 0) expect(b.powerUpChance).toBeLessThanOrEqual(a.powerUpChance);
      expect(b.powerUpDurationScale).toBeLessThan(a.powerUpDurationScale);
      checked++;
    }
    expect(checked).toBe(LEVELS_PER_SEASON - 1);
  });

  it("ends every season on the proven ceiling", () => {
    const last = levelSpec(SEASON_1, LEVELS_PER_SEASON);
    expect(last.tightness).toBeCloseTo(0.95, 10);
    expect(last.layout.gapFrac).toBeCloseTo(0.75, 10);
    expect(last.layout.minWalkFt).toBeCloseTo(40, 10);
    expect(last.layout.oneLadderFrac).toBeCloseTo(0.85, 10);
    expect(last.powerUpChance).toBeCloseTo(0.05, 10);
    expect(levelSpec(SEASON_1, 4).powerUpChance).toBeCloseTo(0.11, 2);
    expect(last.powerUpDurationScale).toBeCloseTo(0.6, 10);
    expect(levelSpec(SEASON_1, 1).powerUpDurationScale).toBeCloseTo(1, 10);
  });

  // The ceilings are the engine's physical caps: 70% of a standing jump's rise
  // (0.7 · 15² / 80) and of a ladder jump's rise (0.7 · 10.5² / 80).
  it("brings in hanging ladders at L9 and short tops at L21", () => {
    expect(levelSpec(SEASON_1, 8).layout.hangingLadderFt).toBe(0);
    expect(levelSpec(SEASON_1, 9).layout.hangingLadderFt).toBeCloseTo(1.6, 10);
    expect(levelSpec(SEASON_1, 300).layout.hangingLadderFt).toBeCloseTo(1.96875, 10);
    expect(levelSpec(SEASON_1, 20).layout.shortTopFt).toBe(0);
    expect(levelSpec(SEASON_1, 21).layout.shortTopFt).toBeCloseTo(0.4, 10);
    expect(levelSpec(SEASON_1, 300).layout.shortTopFt).toBeCloseTo(0.9646875, 10);
    // Some ladders hang from L9, more each level, and every ladder from L30.
    expect(levelSpec(SEASON_1, 8).layout.hangingLadderShare).toBe(0);
    expect(levelSpec(SEASON_1, 9).layout.hangingLadderShare).toBeCloseTo(0.35, 10);
    expect(levelSpec(SEASON_1, 29).layout.hangingLadderShare).toBeLessThan(1);
    expect(levelSpec(SEASON_1, 30).layout.hangingLadderShare).toBe(1);
    expect(levelSpec(SEASON_1, 300).layout.hangingLadderShare).toBe(1);
    let rising = 0;
    for (let n = 10; n <= 30; n++) {
      expect(levelSpec(SEASON_1, n).layout.hangingLadderShare).toBeGreaterThan(levelSpec(SEASON_1, n - 1).layout.hangingLadderShare);
      rising++;
    }
    expect(rising).toBe(21);
  });

  it("unlocks power-ups one at a time, none on L1-3", () => {
    for (const n of [1, 2, 3]) {
      expect(levelSpec(SEASON_1, n).powerUpChance).toBe(0);
      expect(levelSpec(SEASON_1, n).allowedPowerUps).toEqual([]);
    }
    expect(levelSpec(SEASON_1, 4).allowedPowerUps).toEqual(["rapid-climb"]);
    expect(levelSpec(SEASON_1, 4).introPowerUp).toBe("rapid-climb");
    expect(levelSpec(SEASON_1, 5).introPowerUp).toBeNull();
    expect(levelSpec(SEASON_1, 14).allowedPowerUps).toEqual([
      "rapid-climb",
      "sprint-burst",
      "super-jump",
      "slow-lava",
    ]);
    expect(levelSpec(SEASON_1, 300).allowedPowerUps).toHaveLength(8);
  });

  it("gives each level and revision its own seed", () => {
    expect(levelSpec(SEASON_1, 12, 0).seed).toBe("s1:level:12:0");
    expect(levelSpec(SEASON_1, 12, 3).seed).toBe("s1:level:12:3");
  });

  it("rejects levels outside the season", () => {
    expect(() => levelSpec(SEASON_1, 0)).toThrow(RangeError);
    expect(() => levelSpec(SEASON_1, 301)).toThrow(RangeError);
    expect(() => levelSpec(SEASON_1, 1.5)).toThrow(RangeError);
    expect(() => levelSpec(SEASON_1, 1, -1)).toThrow(RangeError);
  });
});

describe("level tower", () => {
  it("pins every level setting on the engine's tower", () => {
    const spec = levelSpec(SEASON_1, 300);
    const tower = levelTower(spec);
    expect(tower.goalM).toBe(spec.goalFt);
    expect(tower.difficulty).toBe(spec.layoutDial);
    expect(tower.powerUpChance).toBe(spec.powerUpChance);
    expect(tower.powerUpDurationScale).toBe(spec.powerUpDurationScale);
    expect(tower.allowedPowerUps).toEqual(spec.allowedPowerUps);
    // The engine's validating readers accept the season's ceiling values.
    expect(ladderHangM(tower)).toBe(spec.layout.hangingLadderFt);
    expect(tower.hangingLadderShare).toBe(spec.layout.hangingLadderShare);
    expect(ladderTopGapM(tower)).toBe(spec.layout.shortTopFt);
    expect(summitFloor(tower)).not.toBeNull();
  });

  it("forces the intro orb only on an intro level", () => {
    expect(levelTower(levelSpec(SEASON_1, 4)).introPowerUp).toBe("rapid-climb");
    expect("introPowerUp" in levelTower(levelSpec(SEASON_1, 5))).toBe(false);
  });

  it("gives every level its own tower", () => {
    expect(levelTower(levelSpec(SEASON_1, 7, 0)).seed).not.toBe(levelTower(levelSpec(SEASON_1, 7, 1)).seed);
  });
});

describe("level lava and pars", () => {
  it("runs the lava at the requested mean after the ramp", () => {
    const cfg = levelHazard({ meanFrac: 0.5, rampSeconds: 30 });
    expect(hazardMeanSpeedFrac(cfg)).toBeCloseTo(0.5, 10);
    expect(cfg.creepPerMinute).toBe(0);
    expect(cfg.startSpeedFrac).toBeLessThan(cfg.endSpeedFrac);
  });

  it("caps the lava at ladder speed", () => {
    const cfg = levelHazard({ meanFrac: 5, rampSeconds: 30 });
    expect(cfg.endSpeedFrac).toBe(1);
    expect(hazardMeanSpeedFrac(cfg)).toBeCloseTo(maxLavaMeanFrac(), 10);
  });

  it("sets star pars and the clock from the route, looser on tutorial levels", () => {
    expect(levelPars(300, 1000)).toEqual({ twoStarTicks: 1150, threeStarTicks: 1000, oneStarTicks: 1500 });
    expect(levelPars(50, 1000)).toEqual({ twoStarTicks: 1150, threeStarTicks: 1000, oneStarTicks: 1500 });
    expect(levelPars(11, 1000)).toEqual({ twoStarTicks: 1150, threeStarTicks: 1000, oneStarTicks: 1500 });
    expect(levelPars(10, 1000)).toEqual({ twoStarTicks: 1450, threeStarTicks: 1200, oneStarTicks: 2000 });
  });
});

describe("season specs", () => {
  const season2: SeasonSpec = {
    ...SEASON_1,
    id: 2,
    name: "Season 2",
    seedSalt: "s2",
    layout: { ...SEASON_1.layout, start: 0.2 },
  };

  it("accepts season 1 and a harder-starting season 2", () => {
    expect(seasonSpecProblems(SEASON_1, null)).toEqual([]);
    expect(seasonSpecProblems(season2, SEASON_1)).toEqual([]);
  });

  it("refuses a season that does not start harder than the last", () => {
    const same = { ...season2, layout: SEASON_1.layout };
    expect(seasonSpecProblems(same, SEASON_1).join()).toMatch(/start harder/);
    const easier = { ...season2, lava: { ...SEASON_1.lava, start: 0 }, layout: { ...SEASON_1.layout, start: 0.05 } };
    expect(seasonSpecProblems(easier, SEASON_1).join()).toMatch(/start harder/);
  });

  it("refuses a season that ends past the proven ceiling or starts too hard", () => {
    expect(seasonSpecProblems({ ...SEASON_1, lava: { ...SEASON_1.lava, end: 1.1 } }, null).join()).toMatch(
      /must end at 1/
    );
    expect(seasonSpecProblems({ ...SEASON_1, lava: { ...SEASON_1.lava, start: 0.31 } }, null).join()).toMatch(
      /lava dial start/
    );
    expect(seasonSpecProblems({ ...SEASON_1, layout: { ...SEASON_1.layout, start: 0.41 } }, null).join()).toMatch(
      /layout dial start/
    );
  });

  it("refuses unlocks on Hard levels and a reused seed salt", () => {
    const hardUnlock = { ...SEASON_1, powerUpUnlocks: [{ level: 5, type: "giant" as const }] };
    expect(seasonSpecProblems(hardUnlock, null).join()).toMatch(/Hard level 5/);
    expect(seasonSpecProblems({ ...season2, seedSalt: "s1" }, SEASON_1).join()).toMatch(/seedSalt/);
  });
});
