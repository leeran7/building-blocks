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
  applyRunSeed,
  MVP_TOWER,
  floorHeight,
  floorIndexAt,
  ladderForFloor,
  laddersForFloor,
  platformsForFloor,
} from "../../src/game/towers";

function horizontalJumpReach(t: ReturnType<typeof buildTower>): number {
  return t.moveSpeed * ((2 * t.jumpSpeed) / t.gravity);
}

describe("buildTower (endless)", () => {
  it("is deterministic for the same slug", () => {
    expect(buildTower("indie-games")).toEqual(buildTower("indie-games"));
  });

  it("changes geometry across run seeds and replays the same seed", () => {
    const base = buildTower("indie-games");
    const a = applyRunSeed(base, "run-aaa");
    const b = applyRunSeed(base, "run-bbb");
    const aAgain = applyRunSeed(base, "run-aaa");
    expect(a.seed).not.toBe(base.seed);
    expect(ladderForFloor(a, 4)).not.toEqual(ladderForFloor(b, 4));
    expect(floorHeight(a, 5)).not.toBe(floorHeight(b, 5));
    expect(ladderForFloor(a, 4)).toEqual(ladderForFloor(aAgain, 4));
    expect(floorHeight(a, 5)).toBe(floorHeight(aAgain, 5));
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

  it("stacks floors with per-floor gaps and maps heights back to indices", () => {
    expect(floorHeight(t, 0)).toBe(0);
    expect(floorHeight(t, 5)).toBeGreaterThan(4 * t.floorGap);
    expect(floorHeight(t, 5)).toBeLessThan(6 * t.floorGap);
    const h5 = floorHeight(t, 5);
    expect(floorIndexAt(t, h5 + 1)).toBe(5);
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

  it("gives most floors more than one route up", () => {
    let multi = 0;
    for (let i = 0; i < 300; i++) {
      const n = laddersForFloor(t, i).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      if (n > 1) multi++;
    }
    expect(multi).toBeGreaterThan(150);
  });

  it("spaces ladders on a floor so their grab radii never overlap", () => {
    for (let i = 0; i < 300; i++) {
      const xs = laddersForFloor(t, i)
        .map((l) => l.x)
        .sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) {
        expect(xs[k] - xs[k - 1]).toBeGreaterThan(2 * t.ladderGrabRadius);
      }
      for (const x of xs) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(t.widthM);
      }
    }
  });

  it("does not line up four ladders in a column", () => {
    const ALIGN_M = 8;
    for (let i = 0; i < 120; i++) {
      for (const start of laddersForFloor(t, i)) {
        let x = start.x;
        let run = 1;
        for (let f = i + 1; f < i + 6; f++) {
          const next = laddersForFloor(t, f)
            .map((l) => l.x)
            .filter((nx) => Math.abs(nx - x) < ALIGN_M)
            .sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
          if (next === undefined) break;
          x = next;
          run += 1;
        }
        expect(run).toBeLessThan(4);
      }
    }
  });

  it("shares one span with every ladder on a floor and reports slots in order", () => {
    for (const i of [1, 4, 17, 88]) {
      const ls = laddersForFloor(t, i);
      for (const l of ls) {
        expect(l.y0).toBe(floorHeight(t, i));
        expect(l.y1).toBe(floorHeight(t, i + 1));
      }
      // The primary ladder is slot 0, which is what ladderForFloor exposes.
      expect(ladderForFloor(t, i)).toEqual(ls[0]);
    }
  });

  it("never carves the gap under a ladder, in or out", () => {
    for (let i = 1; i < 300; i++) {
      const ps = platformsForFloor(t, i);
      if (ps.length !== 2) continue;
      const g0 = ps[0].x1;
      const g1 = ps[1].x0;
      const anchors = [...laddersForFloor(t, i), ...laddersForFloor(t, i - 1)];
      for (const l of anchors) {
        const standable = ps.some((p) => l.x >= p.x0 && l.x <= p.x1);
        expect(standable).toBe(true);
        // And with room to stand beside the rungs, not on the lip of the gap.
        const clear = l.x <= g0 - t.ladderGrabRadius || l.x >= g1 + t.ladderGrabRadius;
        expect(clear).toBe(true);
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
