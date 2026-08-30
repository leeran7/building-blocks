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

function firstCrate(tower: TowerSpec) {
  for (let i = 2; i < 120; i++) {
    const os = obstaclesForFloor(tower, i);
    if (os.length > 0) return os[0];
  }
  throw new Error("expected a crate in the first 120 floors");
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
        expect(o.y0).toBe(floorHeight(TOWER, i));
      }
    }
  });

  it("never overlaps a ladder grab zone", () => {
    for (let i = 2; i < 60; i++) {
      const ladders = [
        ...laddersForFloor(TOWER, i),
        ...laddersForFloor(TOWER, i - 1),
      ];
      const clear = obstacleLadderKeepOutM(TOWER);
      for (const o of obstaclesForFloor(TOWER, i)) {
        for (const l of ladders) {
          expect(o.x0 < l.x + clear && o.x1 > l.x - clear).toBe(false);
        }
      }
    }
  });

  it("sits on solid floor, never in the jump gap", () => {
    for (let i = 2; i < 60; i++) {
      const pieces = platformsForFloor(TOWER, i);
      for (const o of obstaclesForFloor(TOWER, i)) {
        const onPiece = pieces.some(
          (p) => o.x0 >= p.x0 - 1e-9 && o.x1 <= p.x1 + 1e-9
        );
        expect(onPiece).toBe(true);
      }
    }
  });

  it("shows up on some floors so the traverse is not empty", () => {
    let n = 0;
    for (let i = 2; i < 40; i++) n += obstaclesForFloor(TOWER, i).length;
    expect(n).toBeGreaterThan(5);
  });

  it("obstaclesNearY includes crates whose band intersects the window", () => {
    const o = firstCrate(TOWER);
    const near = obstaclesNearY(TOWER, o.y0 - 1, o.y1 + 1);
    expect(near.some((c) => c.x0 === o.x0 && c.floorIndex === o.floorIndex)).toBe(
      true
    );
  });
});

describe("obstacle collision (simulation)", () => {
  it("stops a grounded walker who does not jump", () => {
    const o = firstCrate(TOWER);
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
    const o = firstCrate(TOWER);
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
    const o = firstCrate(TOWER);
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
