/**
 * The mobile app's season 1 levels come from the season generator's manifest,
 * and a device-reported clear is scored against its pars. These tests pin the
 * app's view of each level to the manifest row the season gate proved.
 */

import { describe, expect, it } from "vitest";

import { levelSpec, levelTower } from "../../src/game/levels/levelSpec";
import { runLevel } from "../../src/game/levels/levelRun";
import { SEASON_1 } from "../../src/game/levels/season";
import type { ManifestLevel } from "../../src/game/levels/seasonGate";
import manifest from "../../src/game/levels/seasons/season-1.json";
import { TICK_HZ } from "../../src/game/types";
import { levelPowerUps, levelRunSetup, season1Catalog, seasonLevels } from "../../mobile/src/lib/levels/catalog";
import { durationTicks, jetpackFuelTicks } from "../../src/game/powerups";
import { starsForTime } from "../../mobile/src/lib/levels/model";

const rows = manifest.levels as ManifestLevel[];
const catalog = season1Catalog();
const ms = (ticks: number) => Math.round((ticks / TICK_HZ) * 1000);

describe("season 1 catalog", () => {
  it("has every manifest level, on the manifest's seed revision", () => {
    expect(catalog.count).toBe(300);
    let checked = 0;
    for (const row of rows) {
      const info = catalog.level(row.level);
      const spec = levelSpec(SEASON_1, row.level, row.rev);
      expect(info.seed).toBe(spec.seed);
      expect(info.goalFt).toBe(spec.goalFt);
      expect(info.introPowerUp).toBe(spec.introPowerUp);
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  it("plays a re-rolled level on its re-rolled seed", () => {
    // Season 1 shipped with no re-rolls, so re-roll level 2 by hand.
    const rerolled = rows.map((r) => (r.level === 2 ? { ...r, rev: 3 } : r));
    const levels = seasonLevels(SEASON_1, rerolled);
    expect(levels.catalog.level(2).seed).toBe("s1:level:2:3");
    expect(levels.runSetup(2).tower).toEqual(levelTower(levelSpec(SEASON_1, 2, 3)));
    expect(levels.catalog.level(1).seed).toBe("s1:level:1:0");
  });

  it("refuses a manifest whose rows are out of order", () => {
    const swapped = [rows[1], rows[0], ...rows.slice(2)];
    expect(() => seasonLevels(SEASON_1, swapped).catalog.level(1)).toThrow();
  });

  it("scores stars exactly at the manifest's tick pars", () => {
    let checked = 0;
    for (const row of rows) {
      const { pars } = catalog.level(row.level);
      const { twoStarTicks, threeStarTicks } = row.pars;
      expect(starsForTime(ms(threeStarTicks), pars)).toBe(3);
      expect(starsForTime(ms(threeStarTicks + 1), pars)).toBe(2);
      expect(starsForTime(ms(twoStarTicks), pars)).toBe(2);
      expect(starsForTime(ms(twoStarTicks + 1), pars)).toBe(1);
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  it("marks tutorial levels, intros and tips", () => {
    expect(catalog.level(10).costsLife).toBe(false);
    expect(catalog.level(11).costsLife).toBe(true);
    expect(catalog.level(4).introPowerUp).toBe("rapid-climb");
    expect(catalog.level(9).introTip).toMatch(/Hanging ladders/);
    expect(catalog.level(21).introTip).toMatch(/Short tops/);
    expect(catalog.level(20).introTip).toBeNull();
    expect(() => catalog.level(301)).toThrow();
  });
});

describe("levelRunSetup", () => {
  it("builds the level's own tower, finishing at its goal", () => {
    for (const n of [1, 9, 150]) {
      const row = rows[n - 1];
      const setup = levelRunSetup(n);
      expect(setup.tower).toEqual(levelTower(levelSpec(SEASON_1, n, row.rev)));
      expect(setup.tower.goalM).toBe(catalog.level(n).goalFt);
      // A fresh tower per attempt.
      expect(levelRunSetup(n).tower).not.toBe(setup.tower);
    }
  });

  it("is the lava the season gate proved the route bot beats", () => {
    for (const n of [1, 9, 250]) {
      const row = rows[n - 1];
      const spec = levelSpec(SEASON_1, n, row.rev);
      const run = runLevel(spec, { hazard: levelRunSetup(n).hazard });
      expect(run.outcome).toBe("cleared");
      expect(run.ticks).toBe(row.routeTicks);
    }
    // Three full route-bot runs (L250 is minutes of game time): slow under a loaded suite.
  }, 60_000);
});

describe("power-ups shown before the match", () => {
  it("shows none on levels 1-3", () => {
    for (const n of [1, 2, 3]) {
      expect(catalog.level(n).powerUps).toEqual({ types: [], floorsPerOrb: null, seconds: {} });
    }
  });

  it("shows each level's own rate and the durations its tower will run", () => {
    let checked = 0;
    for (const n of [4, 60, 150, 300]) {
      const spec = levelSpec(SEASON_1, n, rows[n - 1].rev);
      const tower = levelTower(spec);
      const shown = catalog.level(n).powerUps;
      expect(shown).toEqual(levelPowerUps(spec));
      expect(shown.types).toEqual(spec.allowedPowerUps);
      expect(shown.floorsPerOrb).toBe(Math.round(1 / spec.powerUpChance));
      for (const t of shown.types) {
        if (t === "random") continue;
        const ticks = t === "jetpack" ? jetpackFuelTicks(tower) : durationTicks(t, tower);
        // What the sheet says matches what the engine grants, to the tick.
        expect(Math.round(shown.seconds[t]! * TICK_HZ)).toBe(ticks);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The season's later levels drop orbs less often and run them shorter.
    const early = catalog.level(4).powerUps;
    const late = catalog.level(300).powerUps;
    expect(late.floorsPerOrb!).toBeGreaterThan(early.floorsPerOrb!);
    expect(late.seconds["rapid-climb"]!).toBeLessThan(early.seconds["rapid-climb"]!);
  });
});
