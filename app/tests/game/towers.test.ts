/**
 * Tower v3 "The Climb" — endless tower generator tests.
 *
 * Geometry is generated deterministically per (seed, floorIndex), so the world
 * is unbounded yet reproducible for re-simulation (AC-11). Floors must stay
 * solvable (the gap you jump never exceeds the physical jump reach).
 */

import { describe, it, expect } from "vitest";
import {
  buildTower,
  MVP_TOWER,
  floorHeight,
  floorIndexAt,
  ladderForFloor,
  platformsForFloor,
} from "../../src/game/towers";

function horizontalJumpReach(t: ReturnType<typeof buildTower>): number {
  return t.moveSpeed * ((2 * t.jumpSpeed) / t.gravity);
}

describe("buildTower (endless)", () => {
  it("is deterministic for the same slug", () => {
    expect(buildTower("indie-games")).toEqual(buildTower("indie-games"));
  });

  it("has no summit fields — it is an endless descriptor", () => {
    const t = buildTower("developer-tools");
    expect(t).not.toHaveProperty("flagY");
    expect(t).not.toHaveProperty("heightM");
    expect(t.floorGap).toBeGreaterThan(0);
    expect(t.widthM).toBeGreaterThan(0);
  });

  it("resolves an unknown slug into a playable tower (open-ended)", () => {
    const t = buildTower("underwater-basket-weaving");
    expect(t.maxClimbSpeed).toBeGreaterThan(0);
    expect(t.floorGap).toBeGreaterThan(0);
  });

  it("exposes an MVP tower", () => {
    expect(MVP_TOWER.categorySlug).toBe("indie-games");
  });
});

describe("per-floor geometry", () => {
  const t = buildTower("indie-games");

  it("is deterministic per floor index", () => {
    for (const i of [0, 1, 7, 42, 1000]) {
      expect(ladderForFloor(t, i)).toEqual(ladderForFloor(t, i));
      expect(platformsForFloor(t, i)).toEqual(platformsForFloor(t, i));
    }
  });

  it("stacks floors at floorGap intervals and maps heights back to indices", () => {
    expect(floorHeight(t, 0)).toBe(0);
    expect(floorHeight(t, 5)).toBe(5 * t.floorGap);
    expect(floorIndexAt(t, 5 * t.floorGap + 1)).toBe(5);
  });

  it("connects each floor to the next with a ladder within the play width", () => {
    for (const i of [0, 3, 10, 99]) {
      const l = ladderForFloor(t, i);
      expect(l.y0).toBe(floorHeight(t, i));
      expect(l.y1).toBe(floorHeight(t, i + 1));
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(t.widthM);
    }
  });

  it("keeps the base floor a safe full-width platform", () => {
    const base = platformsForFloor(t, 0);
    expect(base.length).toBe(1);
    expect(base[0].x0).toBe(0);
    expect(base[0].x1).toBe(t.widthM);
  });

  it("never makes a gap wider than the jump reach (stays solvable)", () => {
    const reach = horizontalJumpReach(t);
    for (let i = 1; i < 300; i++) {
      const ps = platformsForFloor(t, i);
      if (ps.length === 2) {
        const gap = ps[1].x0 - ps[0].x1;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(reach);
      }
    }
  });

  it("gets harder with altitude: higher floors have wider gaps on average", () => {
    const gapAt = (i: number) => {
      const ps = platformsForFloor(t, i);
      return ps.length === 2 ? ps[1].x0 - ps[0].x1 : 0;
    };
    const low = avgGap(t, 1, 10, gapAt);
    const high = avgGap(t, 60, 90, gapAt);
    expect(high).toBeGreaterThan(low);
  });
});

function avgGap(
  t: ReturnType<typeof buildTower>,
  lo: number,
  hi: number,
  gapAt: (i: number) => number
): number {
  let sum = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    const g = gapAt(i);
    if (g > 0) {
      sum += g;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}
