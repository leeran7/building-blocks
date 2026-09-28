/**
 * Level towers pin a layout difficulty and an orb density (`tower.difficulty`,
 * `tower.powerUpChance`) instead of the free stack's altitude ramp. The free
 * stack itself must not move: freeStackGolden.test.ts pins that. These tests
 * pin the new inputs: they reach the generated geometry, they are validated,
 * and a seed reused at another difficulty never reads a cached layout.
 */

import { describe, expect, it } from "vitest";

import {
  applyRunSeed,
  buildTower,
  difficultyAt,
  laddersForFloor,
  platformsForFloor,
} from "../../src/game/towers";
import { obstaclesForFloor } from "../../src/game/obstacles";
import { powerUpForFloor, spawnChanceForFloor } from "../../src/game/powerups";
import { buildFreeTower } from "../../src/game/freeStack";
import type { TowerSpec } from "../../src/game/types";

const FLOORS = 80;

function level(seed: string, fields: Partial<TowerSpec>): TowerSpec {
  return { ...applyRunSeed(buildFreeTower(), seed), ...fields };
}

/** Widths of the holes carved into floor i (distance between platform pieces). */
function gapWidths(tower: TowerSpec, i: number): number[] {
  const pieces = platformsForFloor(tower, i);
  const out: number[] = [];
  for (let k = 1; k < pieces.length; k++) out.push(pieces[k]!.x0 - pieces[k - 1]!.x1);
  return out;
}

function layout(tower: TowerSpec) {
  const floors = [];
  for (let i = 0; i < FLOORS; i++) {
    floors.push({
      ladders: laddersForFloor(tower, i),
      platforms: platformsForFloor(tower, i),
      obstacles: obstaclesForFloor(tower, i),
      orb: powerUpForFloor(tower, i),
    });
  }
  return floors;
}

describe("difficultyAt", () => {
  it("ramps with altitude on the free stack and holds at 1", () => {
    const free = buildFreeTower();
    expect(difficultyAt(free, 0)).toBe(0);
    expect(difficultyAt(free, 25)).toBe(0.5);
    expect(difficultyAt(free, 50)).toBe(1);
    expect(difficultyAt(free, 400)).toBe(1);
  });

  it("returns a level tower's fixed difficulty on every floor", () => {
    const t = level("lvl", { difficulty: 0.3 });
    for (const i of [0, 1, 25, 50, 400]) expect(difficultyAt(t, i)).toBe(0.3);
  });

  it("accepts the bounds and rejects anything outside [0, 1]", () => {
    expect(difficultyAt(level("lvl", { difficulty: 0 }), 10)).toBe(0);
    expect(difficultyAt(level("lvl", { difficulty: 1 }), 10)).toBe(1);
    for (const bad of [Number.NaN, -0.01, 1.01, Number.POSITIVE_INFINITY]) {
      expect(() => platformsForFloor(level(`bad-${bad}`, { difficulty: bad }), 5)).toThrow(RangeError);
    }
  });
});

describe("a level tower's difficulty reaches the geometry", () => {
  it("difficulty 1 carves the free stack's late-game gap width from the first floors", () => {
    const free = applyRunSeed(buildFreeTower(), "gap-ref");
    const late = new Set<number>();
    for (let i = 60; i < 140; i++) for (const w of gapWidths(free, i)) late.add(w);
    expect(late.size).toBeGreaterThan(0);

    const hard = level("gap-level", { difficulty: 1 });
    let checked = 0;
    for (let i = 1; i < 30; i++) {
      for (const w of gapWidths(hard, i)) {
        expect(late.has(w)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("difficulty 0 keeps the free stack's opening gap width high up the tower", () => {
    const easy = level("gap-level", { difficulty: 0 });
    const hard = level("gap-level", { difficulty: 1 });
    let checked = 0;
    for (let i = 60; i < 140; i++) {
      for (const w of gapWidths(easy, i)) {
        expect(w).toBeLessThan(Math.min(...gapWidths(hard, 5).concat(Infinity)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("geometry caches are keyed by difficulty and orb density", () => {
  it("one seed at two difficulties never shares a cached layout", () => {
    const easyFirst = layout(level("shared-seed", { difficulty: 0 }));
    const hard = layout(level("shared-seed", { difficulty: 1 }));
    const easyAgain = layout(level("shared-seed", { difficulty: 0 }));

    expect(easyAgain).toEqual(easyFirst);
    // More one-ladder floors at difficulty 0 (50% vs 30%): the ladder layout
    // must differ, which it cannot if the hard tower read the easy cache.
    const oneLadder = (f: ReturnType<typeof layout>) => f.filter((x) => x.ladders.length === 1).length;
    expect(oneLadder(easyFirst)).toBeGreaterThan(oneLadder(hard));
  });
});

describe("powerUpChance", () => {
  it("pins the occupancy a level asks for", () => {
    const t = level("orbs", { powerUpChance: 0.1 });
    expect(spawnChanceForFloor(0, t)).toBe(0);
    expect(spawnChanceForFloor(5, t)).toBe(0.1);
    expect(spawnChanceForFloor(500, t)).toBe(0.1);
  });

  it("drives how many orbs a tower generates", () => {
    const count = (chance: number) => {
      const t = level("orb-density", { powerUpChance: chance });
      let n = 0;
      for (let i = 0; i < 300; i++) if (powerUpForFloor(t, i)) n++;
      return n;
    };
    const sparse = count(0.08);
    const dense = count(0.5);
    expect(sparse).toBeGreaterThan(0);
    expect(dense).toBeGreaterThan(sparse * 2);
    // Season levels go down to 5%: rates under 8% must still thin the orbs out.
    const rarest = count(0.04);
    expect(rarest).toBeGreaterThan(0);
    expect(rarest).toBeLessThan(sparse * 0.75);
  });

  it("rejects an occupancy outside [0, 1]", () => {
    expect(spawnChanceForFloor(5, level("orbs", { powerUpChance: 0 }))).toBe(0);
    for (const bad of [Number.NaN, -0.1, 1.5]) {
      expect(() => spawnChanceForFloor(5, level("orbs", { powerUpChance: bad }))).toThrow(RangeError);
    }
  });

  it("a category tower without level fields still ramps as before", () => {
    const t = buildTower("indie-games", { runSeed: "x" });
    expect(spawnChanceForFloor(10, t)).toBe(spawnChanceForFloor(10));
    expect(spawnChanceForFloor(80, t)).toBe(spawnChanceForFloor(80));
  });
});
