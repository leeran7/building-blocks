/**
 * Floor-obstacle tests. Crates are jump-over geometry: deterministic, never on
 * the opening floors, never in a ladder grab zone, always shorter than a jump.
 * Collision is asserted by running the simulation, not by grepping source.
 */

import { describe, it, expect } from "vitest";
import {
  obstaclesForFloor,
  obstaclesNearY,
  jumpApexM,
  obstacleLadderKeepOutM,
  obstacleAhead,
} from "../../src/game/obstacles";
import {
  buildTower,
  applyRunSeed,
  floorHeight,
  laddersForFloor,
  platformsForFloor,
} from "../../src/game/towers";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import {
  MatchState,
  PlayerInput,
  TowerSpec,
  NO_INPUT,
} from "../../src/game/types";

const TOWER = buildTower("indie-games");
const SLOW = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};

function climbingMatch(tower: TowerSpec = TOWER): MatchState {
  const m = createMatch({
    seed: "ob-test",
    mode: "solo",
    tower,
    playerIds: ["p1"],
  });
  m.phase = "climb";
  m.tick = 0;
  return m;
}

function move(dir: -1 | 0 | 1, jump = false): PlayerInput {
  return { moveX: dir, jump, climbY: 0, usePowerUp: false };
}

function firstHurdle(tower: TowerSpec) {
  for (let i = 2; i < 200; i++) {
    const os = obstaclesForFloor(tower, i);
    const floorY = floorHeight(tower, i);
    const grounded = os.filter((o) => Math.abs(o.y0 - floorY) < 1e-9);
    if (os.length <= 2 && grounded.length === os.length && os.length > 0) {
      return os[0];
    }
  }
  throw new Error("expected a hurdle crate in the first 200 floors");
}

function firstStair(tower: TowerSpec) {
  for (let i = 2; i < 200; i++) {
    const os = obstaclesForFloor(tower, i);
    if (os.length < 3) continue;
    const nextY = floorHeight(tower, i + 1);
    const last = os.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
    if (Math.abs(last.y1 - nextY) < 0.05) return { floor: i, crates: os };
  }
  throw new Error("expected a crate stair in the first 200 floors");
}

function firstPyramid(tower: TowerSpec) {
  for (let i = 2; i < 200; i++) {
    const os = obstaclesForFloor(tower, i);
    const floorY = floorHeight(tower, i);
    const nextY = floorHeight(tower, i + 1);
    const peak = os.reduce((a, b) => (a.y1 >= b.y1 ? a : b), os[0]);
    const levels = new Set(os.map((o) => Math.round((o.y0 - floorY) * 100)));
    if (
      os.length >= 5 &&
      levels.size === 3 &&
      peak &&
      peak.y1 < nextY - 1
    ) {
      return { floor: i, crates: os };
    }
  }
  throw new Error("expected a 3-level hurdle triangle in the first 200 floors");
}

describe("obstacle spawn", () => {
  it("is deterministic per (seed, floor)", () => {
    for (const i of [2, 7, 20, 50, 99]) {
      expect(obstaclesForFloor(TOWER, i)).toEqual(obstaclesForFloor(TOWER, i));
    }
  });

  it("changes with the run seed and replays the same seed", () => {
    const base = buildTower("indie-games");
    const a = applyRunSeed(base, "run-aaa");
    const b = applyRunSeed(base, "run-bbb");
    const aAgain = applyRunSeed(base, "run-aaa");
    const floors = [4, 8, 15, 22, 30];
    const sig = (t: TowerSpec) =>
      floors.map((i) => obstaclesForFloor(t, i).map((o) => [o.x0, o.x1]));
    expect(sig(a)).not.toEqual(sig(b));
    expect(sig(a)).toEqual(sig(aAgain));
  });

  it("never places a crate on the base or the floor above it", () => {
    expect(obstaclesForFloor(TOWER, 0)).toEqual([]);
    expect(obstaclesForFloor(TOWER, 1)).toEqual([]);
  });

  it("stays shorter than a standing jump so every crate is clearable", () => {
    const apex = jumpApexM(TOWER);
    for (let i = 2; i < 80; i++) {
      for (const o of obstaclesForFloor(TOWER, i)) {
        expect(o.y1 - o.y0).toBeLessThan(apex);
      }
    }
  });

  it("never overlaps a ladder grab zone", () => {
    for (let i = 2; i < 60; i++) {
      const ladders = [
        ...laddersForFloor(TOWER, i),
        ...laddersForFloor(TOWER, i - 1),
        ...laddersForFloor(TOWER, i + 1),
      ];
      const clear = obstacleLadderKeepOutM(TOWER);
      for (const o of obstaclesForFloor(TOWER, i)) {
        for (const l of ladders) {
          const xHit = o.x0 < l.x + clear && o.x1 > l.x - clear;
          const yHit = o.y0 < l.y1 && o.y1 > l.y0;
          expect(xHit && yHit).toBe(false);
        }
      }
    }
  });

  it("keeps floor-level crates on solid floor, never in the jump gap", () => {
    for (let i = 2; i < 60; i++) {
      const pieces = platformsForFloor(TOWER, i);
      const floorY = floorHeight(TOWER, i);
      for (const o of obstaclesForFloor(TOWER, i)) {
        if (Math.abs(o.y0 - floorY) > 1e-9) continue;
        const onPiece = pieces.some(
          (p) => o.x0 >= p.x0 - 1e-9 && o.x1 <= p.x1 + 1e-9
        );
        expect(onPiece).toBe(true);
      }
    }
  });

  it("shows up on most floors so the traverse is not empty", () => {
    let n = 0;
    let floors = 0;
    for (let i = 2; i < 40; i++) {
      floors += 1;
      if (obstaclesForFloor(TOWER, i).length > 0) n += 1;
    }
    expect(n).toBeGreaterThan(floors * 0.4);
  });

  it("obstaclesNearY includes crates whose band intersects the window", () => {
    const o = firstHurdle(TOWER);
    const near = obstaclesNearY(TOWER, o.y0 - 1, o.y1 + 1);
    expect(near.some((c) => c.x0 === o.x0 && c.floorIndex === o.floorIndex)).toBe(
      true
    );
  });

  it("makes crates wide enough to read as a hurdle, not a pebble", () => {
    const o = firstHurdle(TOWER);
    expect(o.x1 - o.x0).toBeGreaterThanOrEqual(4);
    expect(o.y1 - o.y0).toBeGreaterThan(1.5);
  });

  it("stacks some crates into a stair whose last top meets the next floor", () => {
    const { floor, crates } = firstStair(TOWER);
    const nextY = floorHeight(TOWER, floor + 1);
    const last = crates.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
    expect(last.y1).toBeCloseTo(nextY, 5);
    const dest = platformsForFloor(TOWER, floor + 1);
    const overlap = dest.some((p) => {
      const hit = Math.min(last.x1, p.x1) - Math.max(last.x0, p.x0);
      return hit >= (last.x1 - last.x0) * 0.4;
    });
    expect(overlap).toBe(true);
    for (let k = 1; k < crates.length; k++) {
      expect(crates[k].y0).toBeCloseTo(crates[k - 1].y1, 5);
    }
  });

  it("stacks some hurdles into a 3-level triangle on the slab", () => {
    const { floor, crates } = firstPyramid(TOWER);
    const floorY = floorHeight(TOWER, floor);
    const nextY = floorHeight(TOWER, floor + 1);
    const step = crates[0].y1 - crates[0].y0;
    const peak = crates.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
    expect(peak.y1 - floorY).toBeCloseTo(3 * step, 5);
    expect(peak.y1).toBeLessThan(nextY - 1);
    const levels = new Set(crates.map((o) => Math.round((o.y0 - floorY) * 50)));
    expect(levels.size).toBe(3);
  });

  it("lets a walker crest a hurdle triangle without jumping", () => {
    const { crates } = firstPyramid(TOWER);
    const left = crates.reduce((a, b) => (a.x0 <= b.x0 ? a : b));
    const right = crates.reduce((a, b) => (a.x1 >= b.x1 ? a : b));
    const m = climbingMatch();
    const p = m.players[0];
    p.x = left.x0 - 1.2;
    p.y = left.y0;
    p.peakY = left.y0;
    p.onGround = true;
    p.vy = 0;
    for (let i = 0; i < 400 && (p.x < right.x1 + 0.4 || p.y > left.y0 + 0.3); i++) {
      stepMatch(m, { p1: move(1, false) }, SLOW);
    }
    expect(p.x).toBeGreaterThan(right.x1);
    expect(p.y).toBeCloseTo(left.y0, 1);
    expect(p.status).toBe("climbing");
  });

  it("lets a walker crest a crate stair without jumping", () => {
    const { floor, crates } = firstStair(TOWER);
    const first = crates.reduce((a, b) => (a.y0 <= b.y0 ? a : b));
    const last = crates.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
    const dir: -1 | 1 = last.x0 >= first.x0 ? 1 : -1;
    const m = climbingMatch();
    const p = m.players[0];
    p.x = dir > 0 ? first.x0 - 1.2 : first.x1 + 1.2;
    p.y = first.y0;
    p.peakY = first.y0;
    p.onGround = true;
    p.vy = 0;
    const nextY = floorHeight(TOWER, floor + 1);
    for (let i = 0; i < 500 && p.y < nextY - 0.15; i++) {
      stepMatch(m, { p1: move(dir, false) }, SLOW);
    }
    expect(p.y).toBeGreaterThan(nextY - 0.2);
    expect(p.status).toBe("climbing");
  });

  it("does not treat a crate a storey up as a hurdle on this walk", () => {
    const o = firstHurdle(TOWER);
    const mid = (o.x0 + o.x1) / 2;
    expect(obstacleAhead(TOWER, mid - 1, o.y0, 1)).toBe(true);
    expect(obstacleAhead(TOWER, mid, o.y0 - 8, 1, 20)).toBe(false);
  });
});

describe("obstacle collision (simulation)", () => {
  it("stops a grounded walker who does not jump", () => {
    const o = firstHurdle(TOWER);
    const m = climbingMatch();
    const p = m.players[0];
    p.x = o.x0 - 1.2;
    p.y = o.y0;
    p.peakY = o.y0;
    p.onGround = true;
    p.vy = 0;
    for (let i = 0; i < 45; i++) stepMatch(m, { p1: move(1) }, SLOW);
    expect(p.x).toBeLessThan(o.x0 + 0.05);
    expect(p.y).toBeCloseTo(o.y0, 1);
  });

  it("lets a jumping walker clear the crate", () => {
    const o = firstHurdle(TOWER);
    const m = climbingMatch();
    const p = m.players[0];
    p.x = o.x0 - 2.2;
    p.y = o.y0;
    p.peakY = o.y0;
    p.onGround = true;
    p.vy = 0;
    let ticks = 0;
    while (p.x < o.x1 + 0.4 && ticks < 90) {
      const jump = p.onGround && p.x < o.x1;
      stepMatch(m, { p1: move(1, jump) }, SLOW);
      ticks++;
    }
    expect(p.x).toBeGreaterThan(o.x1);
    expect(p.status).toBe("climbing");
  });

  it("lands on the crate top when falling onto it", () => {
    const o = firstHurdle(TOWER);
    const m = climbingMatch();
    const p = m.players[0];
    p.x = (o.x0 + o.x1) / 2;
    p.y = o.y1 + 1.2;
    p.peakY = o.y1 + 2;
    p.onGround = false;
    p.vy = 0;
    let ticks = 0;
    while (!p.onGround && ticks < 80) {
      stepMatch(m, { p1: NO_INPUT }, SLOW);
      ticks++;
    }
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(o.y1, 1);
  });
});
