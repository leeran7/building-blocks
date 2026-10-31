/**
 * Jump forgiveness around holes and crates (Leeran, 2026-10-31: "jumping over
 * holes feels like falling through the floor", "I get stuck in obstacles when
 * jumping between them").
 *
 *   - late-jump grace: a press a few ticks after walking off a hole's edge
 *     still jumps (COYOTE_TICKS), and one well after it does not;
 *   - early-jump grace: a tap released just before landing fires on landing
 *     (JUMP_BUFFER_TICKS), and a stale one does not;
 *   - hole walls: a climber dropping down a hole while holding toward the far
 *     side falls down the hole, never in under the slab;
 *   - crate faces: a jump that meets a hurdle low stops at its face instead
 *     of passing into the crate, and one that clips the corner steps on top.
 */

import { describe, it, expect } from "vitest";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
  COYOTE_TICKS,
  JUMP_BUFFER_TICKS,
  HOLE_WALL_DEPTH_M,
  HOLE_WALL_INSET_M,
  type SimConfig,
} from "../../src/game/simulation";
import { buildTower, floorHeight, platformsForFloor } from "../../src/game/towers";
import { LEDGE_STEP_M, obstaclesForFloor } from "../../src/game/obstacles";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import type { MatchState, Obstacle, Platform, PlayerInput, TowerSpec } from "../../src/game/types";

const TOWER: TowerSpec = buildTower("indie-games");
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

function input(moveX: -1 | 0 | 1, jump = false): PlayerInput {
  return { moveX, jump, climbY: 0, usePowerUp: false };
}

function standingAt(x: number, y: number): MatchState {
  const m = createMatch({ seed: "jump-forgiveness", mode: "solo", tower: TOWER, playerIds: ["p"] });
  m.phase = "climb";
  m.tick = 0;
  const p = m.players[0]!;
  p.x = x;
  p.y = y;
  p.peakY = y;
  p.onGround = true;
  return m;
}

/** A hole with a long solid run-up on its left, a long landing on its right, and no crates near. */
function findHole(): { y: number; a: Platform; b: Platform } {
  for (let f = 2; f < 200; f++) {
    const ps = platformsForFloor(TOWER, f);
    for (let k = 0; k + 1 < ps.length; k++) {
      const a = ps[k]!;
      const b = ps[k + 1]!;
      if (a.x1 - a.x0 < 10 || b.x1 - b.x0 < 12) continue;
      const near = obstaclesForFloor(TOWER, f).some((o) => o.x1 > a.x1 - 10 && o.x0 < b.x0 + 12);
      if (near) continue;
      return { y: a.y, a, b };
    }
  }
  throw new Error("no clear hole in the first 200 floors");
}

/** A lone hurdle (no crate stacked on or under it) with clear floor on its left. */
function findHurdle(): { y: number; o: Obstacle } {
  for (let f = 2; f < 200; f++) {
    const obs = obstaclesForFloor(TOWER, f);
    const y = floorHeight(TOWER, f);
    for (const o of obs) {
      const stacked = obs.some(
        (q) => q !== o && (Math.abs(q.y0 - o.y1) < 0.05 || Math.abs(q.y1 - o.y0) < 0.05)
      );
      if (stacked || Math.abs(o.y0 - y) > 1e-6) continue;
      const runUp = platformsForFloor(TOWER, f).some((s) => s.x0 <= o.x0 - 8 && s.x1 >= o.x1);
      const clear = !obs.some((q) => q !== o && q.x1 > o.x0 - 8 && q.x0 < o.x0);
      if (runUp && clear) return { y, o };
    }
  }
  throw new Error("no lone hurdle in the first 200 floors");
}

/**
 * Walk right off the hole's left edge and press jump `lateTicks` ticks after
 * the first tick in the air (held 3 ticks, like a tap). Returns how it ended.
 * The grace counts from the last grounded tick, which is one tick earlier.
 */
function lateJumpOverHole(lateTicks: number): "landed" | "fell" {
  const { y, a, b } = findHole();
  const m = standingAt(a.x1 - 4, y);
  const p = m.players[0]!;
  let airTicks = 0;
  for (let t = 0; t < 120; t++) {
    if (!p.onGround) airTicks++;
    const press = airTicks > 0 && airTicks - 1 >= lateTicks && airTicks - 1 < lateTicks + 3;
    stepMatch(m, { p: input(1, press) }, SLOW);
    if (p.onGround && airTicks > 0 && p.x > b.x0) return Math.abs(p.y - y) < 1e-6 ? "landed" : "fell";
    if (p.y < y - 3) return "fell";
  }
  return "fell";
}

describe("late-jump grace at a hole's edge", () => {
  it("still jumps when the press comes just after walking off the edge", () => {
    expect(lateJumpOverHole(0)).toBe("landed");
    expect(lateJumpOverHole(COYOTE_TICKS - 2)).toBe("landed");
  });

  it("does not jump once the grace has run out", () => {
    expect(lateJumpOverHole(COYOTE_TICKS - 1)).toBe("fell");
    expect(lateJumpOverHole(COYOTE_TICKS + 3)).toBe("fell");
  });
});

describe("early-jump grace before landing", () => {
  /** Jump in place, tap jump for one tick `earlyTicks` before landing, report the tick after landing. */
  function tapBeforeLanding(earlyTicks: number): { relaunched: boolean } {
    // Measure the jump's air time first.
    const probe = standingAt(50, 0);
    stepMatch(probe, { p: input(0, true) }, SLOW);
    let air = 1;
    while (!probe.players[0]!.onGround && air < 200) {
      stepMatch(probe, { p: input(0) }, SLOW);
      air++;
    }
    const m = standingAt(50, 0);
    const p = m.players[0]!;
    stepMatch(m, { p: input(0, true) }, SLOW);
    for (let t = 1; t < air; t++) stepMatch(m, { p: input(0, t === air - earlyTicks) }, SLOW);
    expect(p.onGround).toBe(true);
    stepMatch(m, { p: input(0) }, SLOW);
    return { relaunched: p.vy > 0 };
  }

  it("fires a tap made just before landing", () => {
    expect(tapBeforeLanding(2).relaunched).toBe(true);
    expect(tapBeforeLanding(JUMP_BUFFER_TICKS - 1).relaunched).toBe(true);
  });

  it("drops a tap made long before landing", () => {
    expect(tapBeforeLanding(JUMP_BUFFER_TICKS + 3).relaunched).toBe(false);
  });
});

describe("hole walls", () => {
  it("drops down the hole instead of sliding in under the far slab", () => {
    const { y, a, b } = findHole();
    const m = standingAt(a.x1 - 2, y);
    const p = m.players[0]!;
    let inBand = 0;
    for (let t = 0; t < 60; t++) {
      stepMatch(m, { p: input(1) }, SLOW);
      if (p.y < y && y - p.y <= HOLE_WALL_DEPTH_M) {
        inBand++;
        expect(p.x).toBeLessThanOrEqual(b.x0 - HOLE_WALL_INSET_M + 1e-9);
        expect(p.x).toBeGreaterThan(a.x1);
      }
      if (y - p.y > HOLE_WALL_DEPTH_M) break;
    }
    expect(inBand).toBeGreaterThan(3);
  });
});

describe("crate faces in the air", () => {
  it("stops a low jump at the face instead of letting the feet into the crate", () => {
    const { y, o } = findHurdle();
    // Jump from right against the face: the feet are far under the top when they reach it.
    const m = standingAt(o.x0 - 0.3, y);
    const p = m.players[0]!;
    let checked = 0;
    for (let t = 0; t < 60; t++) {
      stepMatch(m, { p: input(1, t === 0) }, SLOW);
      if (p.y < o.y1 - 0.05 && p.y > o.y0 + 0.01) {
        checked++;
        expect(p.x <= o.x0 || p.x >= o.x1).toBe(true);
      }
      if (p.onGround && t > 0) break;
    }
    expect(checked).toBeGreaterThan(0);
    // ...and still gets over it: it rises past the top and lands on or beyond it.
    expect(p.onGround).toBe(true);
    expect(p.x >= o.x1 || Math.abs(p.y - o.y1) < 1e-6).toBe(true);
  });

  it("steps onto the top when the feet meet the face just under it", () => {
    const { o } = findHurdle();
    const m = standingAt(o.x0 - 0.2, o.y1 - LEDGE_STEP_M / 2);
    const p = m.players[0]!;
    p.onGround = false;
    p.vy = -1;
    stepMatch(m, { p: input(1) }, SLOW);
    expect(p.x).toBeGreaterThan(o.x0);
    expect(p.y).toBeCloseTo(o.y1, 6);
    expect(p.onGround).toBe(true);
  });
});
