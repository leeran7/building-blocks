/**
 * Endless ladders (tower.endlessLadders, set by buildFreeTower): the free
 * stack phases in hanging ladders and short tops with altitude, the way the
 * levels bring them in. Levels, tutorials and duels keep their own ladders.
 */

import { describe, expect, it } from "vitest";

import {
  applyRunSeed,
  buildTower,
  ENDLESS_LADDERS,
  floorGapForFloor,
  ladderHangM,
  ladderHangs,
  ladderHasShortTop,
  ladderTopGapM,
  laddersForFloor,
} from "../../src/game/towers";
import { buildFreeTower } from "../../src/game/freeStack";
import { levelSpec, levelTower } from "../../src/game/levels/levelSpec";
import { SEASON_1 } from "../../src/game/levels/season";
import type { TowerSpec } from "../../src/game/types";

const SEEDS = Array.from({ length: 40 }, (_, k) => `endless-${k}`);

/** Share of ladders on floors [lo, hi) across SEEDS that `has` picks. */
function share(
  has: (t: TowerSpec, i: number, slot: number) => boolean,
  lo: number,
  hi: number,
  eligible: (t: TowerSpec, i: number, slot: number) => boolean = () => true
): number {
  let hit = 0;
  let n = 0;
  for (const seed of SEEDS) {
    const t = applyRunSeed(buildFreeTower(), seed);
    for (let i = lo; i < hi; i++) {
      laddersForFloor(t, i).forEach((_, slot) => {
        if (!eligible(t, i, slot)) return;
        n++;
        if (has(t, i, slot)) hit++;
      });
    }
  }
  return hit / n;
}

const tall = (t: TowerSpec, i: number, slot: number) =>
  !ladderHangs(t, i, slot) && floorGapForFloor(t, i) >= t.floorGap;

describe("endless ladders", () => {
  it("keep the opening floors plain", () => {
    expect(share(ladderHangs, 0, ENDLESS_LADDERS.hang.fromFloor)).toBe(0);
    expect(share(ladderHasShortTop, 0, ENDLESS_LADDERS.shortTop.fromFloor)).toBe(0);
  });

  it("hang about 35% of ladders from floor 10, rising to 70% from floor 30", () => {
    expect(share(ladderHangs, 10, 13)).toBeGreaterThan(0.25);
    expect(share(ladderHangs, 10, 13)).toBeLessThan(0.5);
    expect(share(ladderHangs, 30, 60)).toBeGreaterThan(0.62);
    expect(share(ladderHangs, 30, 60)).toBeLessThan(0.78);
  });

  it("stop half the tall ladders short from floor 20, all of them from floor 40", () => {
    expect(share(ladderHasShortTop, 20, 23, tall)).toBeGreaterThan(0.4);
    expect(share(ladderHasShortTop, 20, 23, tall)).toBeLessThan(0.75);
    expect(share(ladderHasShortTop, 40, 60, tall)).toBe(1);
  });

  it("move each ladder's ends by the tower's hang and top gap", () => {
    const t = applyRunSeed(buildFreeTower(), "endless-geometry");
    expect(ladderHangM(t)).toBeGreaterThan(0);
    expect(ladderTopGapM(t)).toBeGreaterThan(0);
    let hung = 0;
    let short = 0;
    for (let i = 0; i < 80; i++) {
      laddersForFloor(t, i).forEach((l, slot) => {
        if (ladderHangs(t, i, slot)) hung++;
        if (ladderHasShortTop(t, i, slot)) short++;
      });
    }
    expect(hung).toBeGreaterThan(0);
    expect(short).toBeGreaterThan(0);
  });

  it("leave duel and category towers plain", () => {
    const t = buildTower("indie-games", { runSeed: "duel" });
    expect(ladderHangM(t)).toBe(0);
    expect(ladderTopGapM(t)).toBe(0);
  });

  it("leave level towers on their own knobs", () => {
    // Level 1 comes before both intros: no hanging ladders or short tops at any height.
    const t = levelTower(levelSpec(SEASON_1, 1));
    expect(t.endlessLadders).toBe(true);
    for (let i = 0; i < 60; i++) {
      laddersForFloor(t, i).forEach((_, slot) => {
        expect(ladderHangs(t, i, slot)).toBe(false);
        expect(ladderHasShortTop(t, i, slot)).toBe(false);
      });
    }
  });
});
