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
  isOnObstacle,
  pickPyramidLevels,
  PYRAMID_LEVEL_OPTIONS,
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
import { grantPowerUp, SPRINT_BURST_MULT } from "../../src/game/powerups";
import { isHeightDeltaLegal } from "../../src/game/antiCheat";
import { GAME_CATEGORIES, TrackArchetype } from "../../src/game/categories";
import {
  MatchState,
  Obstacle,
  PlayerInput,
  PlayerState,
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

/**
 * Level count if floor `i`'s crates form a hill (hurdle triangle): an odd run
 * of 2L−1 crates whose levels climb 0…L−1 and back, peak below the next slab.
 * Null for hurdles, stairs and empty floors.
 */
function hillLevels(tower: TowerSpec, i: number, os: Obstacle[]): number | null {
  if (os.length < 5 || os.length % 2 === 0) return null;
  const floorY = floorHeight(tower, i);
  const nextY = floorHeight(tower, i + 1);
  const peak = os.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
  if (peak.y1 >= nextY - 1) return null;
  const levels = new Set(os.map((o) => Math.round((o.y0 - floorY) * 100)));
  const n = (os.length + 1) / 2;
  return levels.size === n ? n : null;
}

/** Deterministic tower set to search — base seed first, then fixed run seeds. */
const HILL_TOWERS: TowerSpec[] = [
  TOWER,
  ...["hills-a", "hills-b", "hills-c", "hills-d", "hills-e", "hills-f"].map(
    (s) => applyRunSeed(TOWER, s)
  ),
];

type Hill = { tower: TowerSpec; floor: number; crates: Obstacle[] };

function firstHill(levels: number): Hill {
  for (const tower of HILL_TOWERS) {
    for (let i = 2; i < 200; i++) {
      const os = obstaclesForFloor(tower, i);
      if (hillLevels(tower, i, os) === levels) {
        return { tower, floor: i, crates: os.map((o) => ({ ...o })) };
      }
    }
  }
  throw new Error(`expected a ${levels}-level hurdle triangle`);
}

const HILL_SIZES = [3, 4, 6] as const;

function hillBounds(crates: Obstacle[]) {
  return {
    left: Math.min(...crates.map((c) => c.x0)),
    right: Math.max(...crates.map((c) => c.x1)),
    base: Math.min(...crates.map((c) => c.y0)),
    top: Math.max(...crates.map((c) => c.y1)),
    step: crates[0]!.y1 - crates[0]!.y0,
  };
}

function placeGrounded(p: PlayerState, x: number, y: number): void {
  p.x = x;
  p.y = y;
  p.peakY = y;
  p.onGround = true;
  p.vy = 0;
}

/**
 * Grounded inside the hill's footprint but not on its ramp — i.e. standing on
 * the slab beneath the tent (the stuck pocket between the base crates).
 */
function underHill(
  tower: TowerSpec,
  p: PlayerState,
  left: number,
  right: number
): boolean {
  const inside = p.x > left + 0.5 && p.x < right - 0.5;
  return inside && p.onGround && !isOnObstacle(tower, p.x, p.y);
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
      return hit >= (last.x1 - last.x0) * 0.3;
    });
    expect(overlap).toBe(true);
    for (let k = 1; k < crates.length; k++) {
      expect(crates[k].y0).toBeCloseTo(crates[k - 1].y1, 5);
    }
  });

  it("builds stairs with shallow treads so the climb reads as a ramp", () => {
    const { floor, crates } = firstStair(TOWER);
    const step = crates[0].y1 - crates[0].y0;
    const apex = jumpApexM(TOWER);
    expect(crates.length).toBeGreaterThanOrEqual(5);
    expect(step).toBeLessThanOrEqual(Math.min(1.05, apex * 0.38) + 1e-6);
    expect(step).toBeLessThan(
      floorHeight(TOWER, floor + 1) - floorHeight(TOWER, floor)
    );
  });

  it("places floor crates between ladder anchors when corridors exist", () => {
    let checked = 0;
    for (let i = 2; i < 80; i++) {
      const ladderXs = [
        ...laddersForFloor(TOWER, i).map((l) => l.x),
        ...laddersForFloor(TOWER, i - 1).map((l) => l.x),
      ]
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .sort((a, b) => a - b);
      if (ladderXs.length < 2) continue;
      const clear = obstacleLadderKeepOutM(TOWER);
      const floorY = floorHeight(TOWER, i);
      const os = obstaclesForFloor(TOWER, i);
      // Lone slab hurdles only — stairs may extend to reach the next floor.
      const grounded = os.filter((o) => Math.abs(o.y0 - floorY) < 1e-9);
      if (grounded.length === 0 || grounded.length !== os.length) continue;
      if (grounded.length > 2) continue;
      for (const o of grounded) {
        const mid = (o.x0 + o.x1) / 2;
        let inCorridor = false;
        for (let a = 0; a < ladderXs.length - 1; a++) {
          const lo = ladderXs[a]! + clear;
          const hi = ladderXs[a + 1]! - clear;
          if (mid >= lo && mid <= hi) inCorridor = true;
        }
        expect(inCorridor).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("keeps clear gaps between two hurdles on the same floor", () => {
    let found = false;
    for (let i = 2; i < 120; i++) {
      const floorY = floorHeight(TOWER, i);
      const hurdles = obstaclesForFloor(TOWER, i).filter(
        (o) => Math.abs(o.y0 - floorY) < 1e-9
      );
      if (hurdles.length !== 2) continue;
      const [a, b] = [...hurdles].sort((x, y) => x.x0 - y.x0);
      const gap = b!.x0 - a!.x1;
      expect(gap).toBeGreaterThanOrEqual(2.5);
      found = true;
      break;
    }
    expect(found).toBe(true);
  });

  it.each(HILL_SIZES)(
    "stacks some hurdles into a %i-level triangle on the slab",
    (n) => {
      const { tower, floor, crates } = firstHill(n);
      const floorY = floorHeight(tower, floor);
      const nextY = floorHeight(tower, floor + 1);
      const step = crates[0].y1 - crates[0].y0;
      const peak = crates.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
      expect(crates).toHaveLength(2 * n - 1);
      expect(peak.y1 - floorY).toBeCloseTo(n * step, 5);
      expect(peak.y1).toBeLessThan(nextY - 1);
      const levels = new Set(
        crates.map((o) => Math.round((o.y0 - floorY) * 50))
      );
      expect(levels.size).toBe(n);
      // Symmetric tent: crate k and crate 2n-2-k share a level.
      const byX = [...crates].sort((a, b) => a.x0 - b.x0);
      for (let k = 0; k < n; k++) {
        expect(byX[k]!.y0).toBeCloseTo(floorY + k * step, 5);
        expect(byX[2 * n - 2 - k]!.y0).toBeCloseTo(floorY + k * step, 5);
      }
    }
  );

  it.each(HILL_SIZES)(
    "spawns %i-level hills deterministically per (seed, floor)",
    (n) => {
      const { tower, floor, crates } = firstHill(n);
      // Fresh tower objects with the same seed must rebuild the same hill.
      const rebuilt =
        tower === TOWER
          ? buildTower("indie-games")
          : applyRunSeed(buildTower("indie-games"), tower.seed.split(":").pop()!);
      expect(rebuilt.seed).toBe(tower.seed);
      expect(obstaclesForFloor(rebuilt, floor)).toEqual(crates);
      expect(obstaclesForFloor(tower, floor)).toEqual(crates);
    }
  );

  it("rolls bigger hills more often as difficulty climbs", () => {
    const mix = (d: number) => {
      const counts = { 3: 0, 4: 0, 6: 0 };
      const N = 1000;
      for (let k = 0; k < N; k++) counts[pickPyramidLevels(k / N, d)] += 1;
      return counts;
    };
    const easy = mix(0);
    const hard = mix(1);
    // ±2 per 1000 absorbs float rounding at the bucket edges.
    const near = (got: number, want: number) =>
      expect(Math.abs(got - want)).toBeLessThanOrEqual(2);
    near(easy[3], 700);
    near(easy[4], 220);
    near(easy[6], 80);
    near(hard[3], 300);
    near(hard[4], 350);
    near(hard[6], 350);
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      for (const r of [0, 0.3, 0.6, 0.999]) {
        expect(PYRAMID_LEVEL_OPTIONS).toContain(pickPyramidLevels(r, d));
      }
    }
  });

  it("keeps every hill crate apex-clearable and every peak under the next slab", () => {
    const seen = new Set<number>();
    for (const tower of HILL_TOWERS) {
      const apex = jumpApexM(tower);
      for (let i = 2; i < 200; i++) {
        const os = obstaclesForFloor(tower, i);
        const n = hillLevels(tower, i, os);
        if (n === null) continue;
        seen.add(n);
        for (const o of os) expect(o.y1 - o.y0).toBeLessThan(apex);
        const peak = Math.max(...os.map((o) => o.y1));
        expect(peak).toBeLessThanOrEqual(floorHeight(tower, i + 1) - 2 + 1e-9);
      }
    }
    expect([...seen].sort()).toEqual([3, 4, 6]);
  });

  it("keeps every hill size out of ladder grab zones", () => {
    let checked = 0;
    for (const tower of HILL_TOWERS) {
      const clear = obstacleLadderKeepOutM(tower);
      for (let i = 2; i < 200; i++) {
        const os = obstaclesForFloor(tower, i);
        if (hillLevels(tower, i, os) === null) continue;
        const ladders = [
          ...laddersForFloor(tower, i),
          ...laddersForFloor(tower, i - 1),
          ...laddersForFloor(tower, i + 1),
        ];
        for (const o of os) {
          for (const l of ladders) {
            expect(o.x0 < l.x + clear && o.x1 > l.x - clear).toBe(false);
          }
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("places hurdle triangles between ladder anchors", () => {
    let checked = 0;
    for (const tower of HILL_TOWERS)
    for (let i = 2; i < 200; i++) {
      const os = obstaclesForFloor(tower, i);
      if (hillLevels(tower, i, os) === null) continue;
      const ladderXs = [
        ...laddersForFloor(tower, i).map((l) => l.x),
        ...laddersForFloor(tower, i - 1).map((l) => l.x),
      ]
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .sort((a, b) => a - b);
      if (ladderXs.length < 2) continue;
      const clear = obstacleLadderKeepOutM(tower);
      const mid =
        (Math.min(...os.map((o) => o.x0)) + Math.max(...os.map((o) => o.x1))) /
        2;
      let inCorridor = false;
      for (let a = 0; a < ladderXs.length - 1; a++) {
        const lo = ladderXs[a]! + clear;
        const hi = ladderXs[a + 1]! - clear;
        if (mid >= lo && mid <= hi) inCorridor = true;
      }
      expect(inCorridor).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(
    HILL_SIZES.flatMap((n) => [
      { n, dir: 1 as const },
      { n, dir: -1 as const },
    ])
  )(
    "lets a walker crest a $n-level hurdle triangle (dir $dir) without jumping",
    ({ n, dir }) => {
      const { tower, crates } = firstHill(n);
      const { left, right, base, step } = hillBounds(crates);
      const m = climbingMatch(tower);
      const p = m.players[0];
      placeGrounded(p, dir > 0 ? left - 1.2 : right + 1.2, base);
      let maxRise = 0;
      let prevY = p.y;
      const pastFar = () => (dir > 0 ? p.x > right + 0.4 : p.x < left - 0.4);
      for (let i = 0; i < 500 && (!pastFar() || p.y > base + 0.3); i++) {
        stepMatch(m, { p1: move(dir, false) }, SLOW);
        maxRise = Math.max(maxRise, p.y - prevY);
        prevY = p.y;
        // Never airborne or beneath the ramp while walking over the hill.
        expect(p.onGround, `tick ${i} x=${(p.x - left).toFixed(2)} y=${(p.y - base).toFixed(3)}`).toBe(true);
        expect(underHill(tower, p, left, right)).toBe(false);
      }
      expect(pastFar()).toBe(true);
      expect(p.y).toBeCloseTo(base, 0);
      expect(p.status).toBe("climbing");
      // Tent ramp: no single-tick snap of a full pyramid tread.
      expect(maxRise).toBeLessThan(step * 0.85 + 0.05);
    }
  );

  it.each(HILL_SIZES)(
    "does not yank a mid-air fall down onto a %i-level hill tent",
    (n) => {
      const { tower, crates } = firstHill(n);
      const peak = crates.reduce((a, b) => (a.y1 >= b.y1 ? a : b));
      const m = climbingMatch(tower);
      const p = m.players[0];
      const surfaceApprox = peak.y1;
      p.x = (peak.x0 + peak.x1) / 2;
      p.y = surfaceApprox + 3.2;
      p.peakY = p.y;
      p.onGround = false;
      p.vy = 0;
      stepMatch(m, { p1: move(0, false) }, SLOW);
      expect(p.y).toBeGreaterThan(surfaceApprox + 1.5);
      expect(p.onGround).toBe(false);
    }
  );

  it("lets a walker crest a crate stair onto the next floor without jumping", () => {
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
    const step = crates[0].y1 - crates[0].y0;
    let maxRise = 0;
    let prevY = p.y;
    const pastLast = () =>
      dir > 0 ? p.x > last.x1 + 0.8 : p.x < last.x0 - 0.8;
    for (let i = 0; i < 900 && !(pastLast() && p.y >= nextY - 0.1); i++) {
      stepMatch(m, { p1: move(dir, false) }, SLOW);
      maxRise = Math.max(maxRise, p.y - prevY);
      prevY = p.y;
      // Must not fall off the top while cresting onto the next slab.
      if (p.y > nextY - 1.5) {
        expect(p.onGround).toBe(true);
      }
    }
    expect(pastLast()).toBe(true);
    expect(p.y).toBeCloseTo(nextY, 1);
    expect(p.onGround).toBe(true);
    expect(p.status).toBe("climbing");
    // Continuous ramp: no single-tick snap of a full old-style tread.
    expect(maxRise).toBeLessThan(step * 0.85 + 0.05);
  });

  it("does not yank a mid-air fall down onto a stair ramp", () => {
    const { crates } = firstStair(TOWER);
    const mid = crates[Math.floor(crates.length / 2)]!;
    const bandX = (mid.x0 + mid.x1) / 2;
    const m = climbingMatch();
    const p = m.players[0];
    // Hover well above the ramp, then fall — must not snap to the surface
    // in a single tick (landingObstacle handles a normal one-way land).
    const surfaceApprox = mid.y1;
    p.x = bandX;
    p.y = surfaceApprox + 3.2;
    p.peakY = p.y;
    p.onGround = false;
    p.vy = 0;
    stepMatch(m, { p1: move(0, false) }, SLOW);
    expect(p.y).toBeGreaterThan(surfaceApprox + 1.5);
    expect(p.onGround).toBe(false);
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

  it("lets a Giant walk over a small hurdle without jumping", () => {
    const o = firstHurdle(TOWER);
    const m = climbingMatch();
    const p = m.players[0];
    p.x = o.x0 - 1.2;
    p.y = o.y0;
    p.peakY = o.y0;
    p.onGround = true;
    p.vy = 0;
    grantPowerUp(p, "giant", m.tick);
    let crested = false;
    for (let i = 0; i < 90; i++) {
      stepMatch(m, { p1: move(1) }, SLOW);
      if (p.y >= o.y1 - 0.05) crested = true;
    }
    expect(crested).toBe(true);
    expect(p.x).toBeGreaterThan(o.x1);
    expect(p.status).toBe("climbing");
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

/**
 * Adversarial "can I get stuck?" coverage. Every scenario drives the real
 * stepMatch tick and asserts the climber gets out the far side (or back out
 * the near side) within a bounded number of ticks, and is never left grounded
 * on the slab beneath a hill's ramp.
 */
describe("obstacles never trap a climber", () => {
  const EXIT_TICKS = 300;
  /** Sub-step start offsets (m) so a walk step can end partway up a slope. */
  const STEP_PHASES = [0, 0.13, 0.29] as const;

  type Drive = (tick: number, p: PlayerState) => PlayerInput;

  /** Step until `done`, asserting the climber never sinks beneath the hill. */
  function drive(
    m: MatchState,
    hill: { left: number; right: number },
    input: Drive,
    done: (p: PlayerState) => boolean,
    maxTicks = EXIT_TICKS
  ): boolean {
    const p = m.players[0]!;
    for (let t = 0; t < maxTicks; t++) {
      stepMatch(m, { p1: input(t, p) }, SLOW);
      expect(underHill(m.tower, p, hill.left, hill.right)).toBe(false);
      if (done(p)) return true;
    }
    return false;
  }

  const SIZE_DIRS = HILL_SIZES.flatMap((n) => [
    { n, dir: 1 as const },
    { n, dir: -1 as const },
  ]);

  describe.each(SIZE_DIRS)("$n-level hill, heading $dir", ({ n, dir }) => {
    const hill = firstHill(n);
    const b = hillBounds(hill.crates);
    const back: -1 | 1 = dir > 0 ? -1 : 1;
    const nearX = (gap: number) => (dir > 0 ? b.left - gap : b.right + gap);
    const pastFar = (p: PlayerState) =>
      dir > 0 ? p.x > b.right + 0.3 : p.x < b.left - 0.3;
    const pastNear = (p: PlayerState) =>
      dir > 0 ? p.x < b.left - 0.3 : p.x > b.right + 0.3;

    it("never tunnels under the hill when jumping into the slope from the base", () => {
      // Regression: a rising jump that climbed slower than the ramp slipped
      // under it and fell to the slab between the base crates — walled in.
      for (const runUp of [0, 0.5, 1, 1.5, 2, 3, 4]) {
        for (const jumpAt of [0, 1, 2, 3, 6]) {
          const m = climbingMatch(hill.tower);
          placeGrounded(m.players[0]!, nearX(runUp), b.base);
          const out = drive(m, b, (t) => move(dir, t === jumpAt), pastFar);
          expect(out, `runUp=${runUp} jumpAt=${jumpAt}`).toBe(true);
        }
      }
    });

    it("jumps off mid-slope (uphill, downhill, straight up) and still gets over", () => {
      for (const walkTicks of [2, 5, 9, 14, 20]) {
        for (const jumpDir of [dir, back, 0] as const) {
          const m = climbingMatch(hill.tower);
          placeGrounded(m.players[0]!, nearX(1.2), b.base);
          const input: Drive = (t) => {
            if (t < walkTicks) return move(dir);
            if (t === walkTicks) return move(jumpDir, true);
            if (t < walkTicks + 12) return move(jumpDir);
            return move(dir);
          };
          const out = drive(m, b, input, pastFar);
          expect(out, `walk=${walkTicks} jumpDir=${jumpDir}`).toBe(true);
        }
      }
    });

    it("turns back mid-slope without reaching the peak and walks off the near side", () => {
      // The base is ≥ 1.2 m (3 walk steps) away: every run gets onto the slope.
      for (const walkTicks of [5, 7, 10, 15]) {
        for (const phase of STEP_PHASES) {
          const m = climbingMatch(hill.tower);
          const p = m.players[0]!;
          placeGrounded(p, nearX(1.2 + phase), b.base);
          const why = `walk=${walkTicks} phase=${phase}`;
          // The start is already past the near base — only count the exit
          // once the climber has turned back, or `done` fires on tick 0.
          let turned = false;
          const out = drive(
            m,
            b,
            (t, q) => {
              // Grounded all the way back down and off the base — no hop.
              expect(q.onGround, `${why} tick ${t}`).toBe(true);
              turned = t >= walkTicks;
              return move(turned ? back : dir);
            },
            (q) => turned && pastNear(q) && q.y <= b.base + 0.05
          );
          expect(out, why).toBe(true);
          expect(p.onGround, why).toBe(true);
          // It really was on the slope before turning back.
          expect(p.peakY, why).toBeGreaterThan(b.base + 0.1);
        }
      }
    });

    it("lands a mid-air drop anywhere on the slope, then walks off", () => {
      for (let f = 0.05; f < 1; f += 0.1) {
        for (const drift of [-1, 0, 1] as const) {
          for (const above of [0.4, 4]) {
            const m = climbingMatch(hill.tower);
            const p = m.players[0]!;
            p.x = b.left + f * (b.right - b.left);
            p.y = b.top + above;
            p.peakY = p.y;
            p.onGround = false;
            p.vy = 0;
            const why = `f=${f.toFixed(2)} drift=${drift} above=${above}`;
            const landed = drive(m, b, () => move(drift), (q) => q.onGround, 60);
            expect(landed, why).toBe(true);
            expect(drive(m, b, () => move(dir), pastFar), why).toBe(true);
          }
        }
      }
    });

    it("stands on and walks away from every crate seam", () => {
      const seams = hill.crates.flatMap((c) => [c.x0, c.x1]);
      for (const x of seams) {
        const m = climbingMatch(hill.tower);
        const p = m.players[0]!;
        p.x = x;
        p.y = b.top + 0.3;
        p.peakY = p.y;
        p.onGround = false;
        p.vy = 0;
        expect(drive(m, b, () => move(0), (q) => q.onGround, 60)).toBe(true);
        if (x > b.left + 0.05 && x < b.right - 0.05) {
          expect(isOnObstacle(hill.tower, p.x, p.y), `seam x=${x}`).toBe(true);
        }
        expect(drive(m, b, () => move(dir), pastFar), `seam x=${x}`).toBe(true);
      }
    });

    it("lets a climber already beneath the tent walk out instead of walling them in", () => {
      const m = climbingMatch(hill.tower);
      const p = m.players[0]!;
      placeGrounded(p, (b.left + b.right) / 2, b.base);
      let out = false;
      for (let t = 0; t < EXIT_TICKS && !out; t++) {
        stepMatch(m, { p1: move(dir) }, SLOW);
        out = pastFar(p);
      }
      expect(out).toBe(true);
      expect(p.y).toBeCloseTo(b.base, 1);
    });
  });

  it("never tunnels under a stair ramp when jumping onto it from the low end", () => {
    const { floor, crates } = firstStair(TOWER);
    const first = crates.reduce((a, c) => (a.y0 <= c.y0 ? a : c));
    const last = crates.reduce((a, c) => (a.y1 >= c.y1 ? a : c));
    const dir: -1 | 1 = last.x0 >= first.x0 ? 1 : -1;
    const nextY = floorHeight(TOWER, floor + 1);
    for (const runUp of [0, 1, 2, 3]) {
      for (const jumpAt of [0, 2, 4]) {
        const m = climbingMatch();
        const p = m.players[0]!;
        placeGrounded(p, dir > 0 ? first.x0 - runUp : first.x1 + runUp, first.y0);
        let t = 0;
        for (; t < 900; t++) {
          stepMatch(m, { p1: move(dir, t === jumpAt) }, SLOW);
          const past = dir > 0 ? p.x > last.x1 + 0.8 : p.x < last.x0 - 0.8;
          if (past && p.y >= nextY - 0.1) break;
        }
        expect(t, `runUp=${runUp} jumpAt=${jumpAt}`).toBeLessThan(900);
        expect(p.y).toBeCloseTo(nextY, 1);
      }
    }
  });

  describe("stairs, both orientations", () => {
    type Stair = {
      tower: TowerSpec;
      floor: number;
      crates: Obstacle[];
      /** +1 climbs left→right; −1 is the mirrored (right→left) build. */
      dir: -1 | 1;
      bottom: Obstacle;
      top: Obstacle;
      left: number;
      right: number;
    };

    /** Up to `max` stairs climbing in `dir`, from the fixed tower set. */
    function stairsFacing(dir: -1 | 1, max = 3): Stair[] {
      const out: Stair[] = [];
      for (const tower of HILL_TOWERS) {
        for (let i = 2; i < 120 && out.length < max; i++) {
          const os = obstaclesForFloor(tower, i);
          if (os.length < 3) continue;
          const top = os.reduce((a, c) => (a.y1 >= c.y1 ? a : c));
          if (Math.abs(top.y1 - floorHeight(tower, i + 1)) > 0.05) continue;
          const bottom = os.reduce((a, c) => (a.y0 <= c.y0 ? a : c));
          if ((top.x0 >= bottom.x0 ? 1 : -1) !== dir) continue;
          out.push({
            tower,
            floor: i,
            crates: os,
            dir,
            bottom,
            top,
            left: Math.min(...os.map((o) => o.x0)),
            right: Math.max(...os.map((o) => o.x1)),
          });
        }
      }
      if (out.length === 0) throw new Error(`expected a stair facing ${dir}`);
      return out;
    }

    /** The slab piece of floor `i` under `x`, shrunk so a walk stays on it. */
    function slabUnder(tower: TowerSpec, i: number, x: number) {
      const piece = platformsForFloor(tower, i).find(
        (s) => x >= s.x0 && x <= s.x1
      );
      if (!piece) return null;
      return {
        lo: Math.max(piece.x0, 0) + 0.5,
        hi: Math.min(piece.x1, tower.widthM) - 0.5,
      };
    }

    const ORIENTS = [1, -1] as const;
    const ORIENT_WALKS = ORIENTS.flatMap((orient) =>
      [1, -1].map((walk) => ({ orient, walk: walk as -1 | 1 }))
    );

    it.each(ORIENT_WALKS)(
      "never pulls a walker on the next slab down through it onto a stair (stair $orient, walking $walk)",
      ({ orient, walk }) => {
        // Regression: a stair's top treads sit flush under the next floor's
        // slab. Walking that slab across the high end, the ramp-follow dragged
        // the walker down the treads beneath it — a whole storey lost — or
        // (walking uphill) yanked them ~1 m under the slab for a few ticks.
        let checked = 0;
        for (const s of stairsFacing(orient)) {
          const slabY = floorHeight(s.tower, s.floor + 1);
          const span = slabUnder(s.tower, s.floor + 1, (s.top.x0 + s.top.x1) / 2);
          if (!span) continue;
          const lo = Math.max(span.lo, s.left - 3);
          const hi = Math.min(span.hi, s.right + 3);
          const m = climbingMatch(s.tower);
          const p = m.players[0]!;
          placeGrounded(p, walk > 0 ? lo : hi, slabY);
          const why = `${s.tower.seed} floor ${s.floor}`;
          for (let t = 0; t < 400 && p.x >= lo && p.x <= hi; t++) {
            stepMatch(m, { p1: move(walk) }, SLOW);
            expect(p.y, `${why} tick ${t} x=${p.x.toFixed(2)}`).toBeGreaterThan(
              slabY - 0.05
            );
          }
          // Walked the whole slab span over the stair's high end.
          expect(walk > 0 ? p.x > hi : p.x < lo, why).toBe(true);
          checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
      }
    );

    it.each(ORIENTS)(
      "walking under stair %i's high end at slab level stops only at the lowest crate's real face",
      (orient) => {
        // Beneath the elevated treads the slab stays open (a stair's high end
        // is walk-under). The first thing that may stop the walker is the
        // lowest crate's own inner face — the same place in both orientations.
        let checked = 0;
        for (const s of stairsFacing(orient)) {
          const slabY = floorHeight(s.tower, s.floor);
          const toward: -1 | 1 = s.dir > 0 ? -1 : 1;
          const faceX = s.dir > 0 ? s.bottom.x1 : s.bottom.x0;
          const span = slabUnder(s.tower, s.floor, faceX);
          if (!span) continue;
          const startX = Math.max(span.lo, Math.min(span.hi, faceX - toward * 8));
          const m = climbingMatch(s.tower);
          const p = m.players[0]!;
          placeGrounded(p, startX, slabY);
          const why = `${s.tower.seed} floor ${s.floor}`;
          let stallX: number | null = null;
          for (let t = 0; t < 80 && stallX === null; t++) {
            const before = p.x;
            stepMatch(m, { p1: move(toward) }, SLOW);
            expect(p.y, `${why} tick ${t}`).toBeCloseTo(slabY, 6);
            if (p.x === before) stallX = p.x;
          }
          expect(stallX, `${why}: never reached the low tread`).not.toBeNull();
          expect(Math.abs(stallX! - faceX), `${why}: stalled off-face`).toBeLessThan(0.05);
          // Backing off the face is never resisted.
          stepMatch(m, { p1: move(toward > 0 ? -1 : 1) }, SLOW);
          expect(toward > 0 ? p.x < stallX! : p.x > stallX!, why).toBe(true);
          checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
      }
    );

    it.each(ORIENTS)(
      "turns back anywhere on stair %i and walks off its low end without a hop",
      (orient) => {
        const s = stairsFacing(orient)[0]!;
        const slabY = floorHeight(s.tower, s.floor);
        const up: -1 | 1 = s.dir;
        const lowOuter = s.dir > 0 ? s.left : s.right;
        // Off-lattice start phases: a walk step that lands exactly on the ramp's
        // end never exercises the tick that steps off it partway up the slope.
        const runs = [5, 8, 12, 20, 40].flatMap((upTicks) =>
          STEP_PHASES.map((phase) => ({ upTicks, phase }))
        );
        for (const { upTicks, phase } of runs) {
          const m = climbingMatch(s.tower);
          const p = m.players[0]!;
          placeGrounded(p, lowOuter - up * (1.2 + phase), slabY);
          const why = `${s.tower.seed} floor ${s.floor} up=${upTicks} phase=${phase}`;
          for (let t = 0; t < upTicks; t++) stepMatch(m, { p1: move(up) }, SLOW);
          expect(p.y, why).toBeGreaterThan(slabY);
          let off = false;
          for (let t = 0; t < 300 && !off; t++) {
            stepMatch(m, { p1: move(up > 0 ? -1 : 1) }, SLOW);
            // Grounded every tick of the descent and the step off the end.
            expect(p.onGround, `${why} tick ${t} x=${p.x.toFixed(2)}`).toBe(true);
            off = up > 0 ? p.x < lowOuter - 0.5 : p.x > lowOuter + 0.5;
          }
          expect(off, why).toBe(true);
          expect(p.y, why).toBeCloseTo(slabY, 6);
        }
      }
    );
  });

  describe("lone hurdles", () => {
    function twoHurdleFloor() {
      for (let i = 2; i < 200; i++) {
        const floorY = floorHeight(TOWER, i);
        const os = obstaclesForFloor(TOWER, i);
        if (os.length !== 2) continue;
        if (!os.every((o) => Math.abs(o.y0 - floorY) < 1e-9)) continue;
        const [a, c] = [...os].sort((x, y) => x.x0 - y.x0);
        return { a: a!, c: c! };
      }
      throw new Error("expected a two-hurdle floor");
    }

    /** Grounded on the slab strictly inside a crate's footprint, below its top. */
    function wedged(p: PlayerState, o: Obstacle): boolean {
      return (
        p.onGround &&
        p.x > o.x0 + 0.05 &&
        p.x < o.x1 - 0.05 &&
        p.y < o.y1 - 0.05
      );
    }

    it("blocks a walker between two hurdles both ways, and a jump clears either", () => {
      const { a, c } = twoHurdleFloor();
      const gapMid = (a.x1 + c.x0) / 2;
      for (const dir of [1, -1] as const) {
        const m = climbingMatch();
        const p = m.players[0]!;
        placeGrounded(p, gapMid, a.y0);
        for (let t = 0; t < 45; t++) stepMatch(m, { p1: move(dir) }, SLOW);
        // Still blocked: jumping stays required to pass a lone hurdle.
        expect(p.x).toBeGreaterThan(a.x1 - 0.05);
        expect(p.x).toBeLessThan(c.x0 + 0.05);
        expect(p.y).toBeCloseTo(a.y0, 1);
      }
      for (const dir of [1, -1] as const) {
        for (const jumpAt of [0, 1, 2, 3, 4, 6]) {
          const m = climbingMatch();
          const p = m.players[0]!;
          placeGrounded(p, gapMid, a.y0);
          const target = dir > 0 ? c : a;
          let cleared = false;
          for (let t = 0; t < 120 && !cleared; t++) {
            // Keep hopping from the gap — pressed against the face included.
            const jump = t === jumpAt || (t > jumpAt && p.onGround);
            stepMatch(m, { p1: move(dir, jump) }, SLOW);
            expect(wedged(p, a) || wedged(p, c)).toBe(false);
            cleared = dir > 0 ? p.x > target.x1 : p.x < target.x0;
          }
          expect(cleared, `dir=${dir} jumpAt=${jumpAt}`).toBe(true);
        }
      }
    });

    it("holds a walker pressed into a hurdle face perfectly still (no jitter)", () => {
      const o = firstHurdle(TOWER);
      for (const dir of [1, -1] as const) {
        const m = climbingMatch();
        const p = m.players[0]!;
        placeGrounded(p, dir > 0 ? o.x0 - 1.2 : o.x1 + 1.2, o.y0);
        for (let t = 0; t < 10; t++) stepMatch(m, { p1: move(dir) }, SLOW);
        const restX = p.x;
        for (let t = 0; t < 40; t++) {
          stepMatch(m, { p1: move(dir) }, SLOW);
          expect(p.x).toBe(restX);
          expect(p.y).toBeCloseTo(o.y0, 6);
          expect(p.onGround).toBe(true);
        }
        // And backing off is never resisted.
        stepMatch(m, { p1: move(dir > 0 ? -1 : 1) }, SLOW);
        expect(dir > 0 ? p.x < restX : p.x > restX).toBe(true);
      }
    });

    it("never leaves a jumper wedged inside a hurdle from any run-up", () => {
      const o = firstHurdle(TOWER);
      for (const dir of [1, -1] as const) {
        for (let runUp = 0; runUp <= 10; runUp += 0.5) {
          const m = climbingMatch();
          const p = m.players[0]!;
          const x0 = dir > 0 ? o.x0 - runUp - 0.05 : o.x1 + runUp + 0.05;
          placeGrounded(p, x0, o.y0);
          let cleared = false;
          for (let t = 0; t < 150 && !cleared; t++) {
            stepMatch(m, { p1: move(dir, p.onGround) }, SLOW);
            expect(wedged(p, o), `dir=${dir} runUp=${runUp}`).toBe(false);
            cleared = dir > 0 ? p.x > o.x1 + 0.3 : p.x < o.x0 - 0.3;
          }
          expect(cleared, `dir=${dir} runUp=${runUp}`).toBe(true);
        }
      }
    });
  });
});

/**
 * Ramps turn run speed into climb speed (slope × moveSpeed). The server re-sims
 * every duel through stepMatch, and the height-rate sentinel flags K
 * consecutive ticks above the legal ascent envelope. An honest walker who
 * crosses a hill or climbs a stair at full speed (sprint-burst included) must
 * never be flagged, or a staked duel locks. These tests drive the real
 * stepMatch + sentinel; nothing about the envelope is re-derived here.
 */
describe("ramps never trip the height-rate anti-cheat sentinel", () => {
  const ARCHETYPES: TrackArchetype[] = [
    "ladder-climb",
    "platform-gauntlet",
    "crumble-stairs",
    "wall-jump-chimney",
  ];
  // Fixed run seeds whose first 120 floors include a (rare) 6-level hill on
  // every archetype — big hills need a wide between-ladder corridor.
  const RUN_SEEDS = ["ac-0", "ac-2", "ac-3", "ac-10", "ac-12"];
  const SCAN_FLOORS = 120;

  function archetypeTowers(a: TrackArchetype): TowerSpec[] {
    const cat = GAME_CATEGORIES.find((c) => c.themeArchetype === a);
    if (!cat) throw new Error(`no category for archetype ${a}`);
    const base = buildTower(cat.slug);
    return [base, ...RUN_SEEDS.map((s) => applyRunSeed(base, s))];
  }

  type Ramp = { tower: TowerSpec; floor: number; crates: Obstacle[] };

  /** Crate-to-crate x advance — the smaller it is, the steeper the ramp. */
  function advanceOf(crates: Obstacle[]): number {
    const xs = crates.map((c) => c.x0).sort((a, b) => a - b);
    return xs[1]! - xs[0]!;
  }

  type Steepest = { hills: Map<number, Ramp>; stair: Ramp | null };
  const scanned = new Map<TrackArchetype, Steepest>();

  /** Steepest-looking hill per size and steepest stair over the scan window. */
  function steepestRamps(a: TrackArchetype): Steepest {
    const cached = scanned.get(a);
    if (cached) return cached;
    const hills = new Map<number, Ramp>();
    let stair: Ramp | null = null;
    let stairGrade = -Infinity;
    for (const tower of archetypeTowers(a)) {
      for (let i = 2; i < SCAN_FLOORS; i++) {
        const os = obstaclesForFloor(tower, i);
        const n = hillLevels(tower, i, os);
        if (n !== null) {
          const prev = hills.get(n);
          if (!prev || advanceOf(os) < advanceOf(prev.crates)) {
            hills.set(n, { tower, floor: i, crates: os });
          }
          continue;
        }
        if (os.length < 3) continue;
        const top = os.reduce((x, y) => (x.y1 >= y.y1 ? x : y));
        if (Math.abs(top.y1 - floorHeight(tower, i + 1)) > 0.05) continue;
        const grade = (os[0]!.y1 - os[0]!.y0) / advanceOf(os);
        if (grade > stairGrade) {
          stairGrade = grade;
          stair = { tower, floor: i, crates: os };
        }
      }
    }
    const found = { hills, stair };
    scanned.set(a, found);
    return found;
  }

  type Crossing = {
    done: boolean;
    flagged: boolean;
    illegalTicks: number[];
    topSpeed: number;
  };

  /**
   * Walk grounded from `startX` holding `dir` at full speed until `done`.
   * Records every tick whose rise the real sentinel predicate rejects.
   */
  function cross(
    tower: TowerSpec,
    startX: number,
    startY: number,
    dir: -1 | 1,
    sprint: boolean,
    done: (p: PlayerState) => boolean
  ): Crossing {
    const m = climbingMatch(tower);
    const p = m.players[0]!;
    placeGrounded(p, startX, startY);
    if (sprint) grantPowerUp(p, "sprint-burst", m.tick);
    const illegalTicks: number[] = [];
    let topSpeed = 0;
    for (let t = 0; t < 400; t++) {
      const prevY = p.y;
      stepMatch(m, { p1: move(dir) }, SLOW);
      topSpeed = Math.max(topSpeed, Math.abs(p.vx));
      if (!isHeightDeltaLegal(prevY, p.y, tower)) illegalTicks.push(t);
      if (done(p)) {
        return { done: true, flagged: p.cheatFlagged, illegalTicks, topSpeed };
      }
    }
    return { done: false, flagged: p.cheatFlagged, illegalTicks, topSpeed };
  }

  const CASES = ARCHETYPES.flatMap((archetype) =>
    [false, true].map((sprint) => ({ archetype, sprint }))
  );

  describe.each(CASES)("$archetype, sprint-burst $sprint", ({ archetype, sprint }) => {
    const { hills, stair } = steepestRamps(archetype);

    function expectHonest(c: Crossing, tower: TowerSpec, why: string): void {
      expect(c.done, `${why}: never got over`).toBe(true);
      expect(c.illegalTicks, `${why}: over the ascent envelope`).toEqual([]);
      expect(c.flagged, `${why}: cheat-flagged`).toBe(false);
      const want = tower.moveSpeed * (sprint ? SPRINT_BURST_MULT : 1);
      expect(c.topSpeed, `${why}: not at full speed`).toBeCloseTo(want, 6);
    }

    it("spawns every hill size and a stair to cross", () => {
      expect([...hills.keys()].sort()).toEqual([3, 4, 6]);
      expect(stair).not.toBeNull();
    });

    it.each(
      HILL_SIZES.flatMap((n) => [
        { n, dir: 1 as const },
        { n, dir: -1 as const },
      ])
    )("crosses the steepest $n-level hill (dir $dir) unflagged", ({ n, dir }) => {
      const hill = hills.get(n);
      if (!hill) throw new Error(`no ${n}-level hill for ${archetype}`);
      const b = hillBounds(hill.crates);
      const c = cross(
        hill.tower,
        dir > 0 ? b.left - 1.2 : b.right + 1.2,
        b.base,
        dir,
        sprint,
        (p) =>
          (dir > 0 ? p.x > b.right + 0.4 : p.x < b.left - 0.4) &&
          p.onGround &&
          p.y <= b.base + 0.05
      );
      expectHonest(c, hill.tower, `${hill.tower.seed} floor ${hill.floor}`);
    });

    it("climbs the steepest stair onto the next floor unflagged", () => {
      if (!stair) throw new Error(`no stair for ${archetype}`);
      const first = stair.crates.reduce((x, y) => (x.y0 <= y.y0 ? x : y));
      const last = stair.crates.reduce((x, y) => (x.y1 >= y.y1 ? x : y));
      const dir: -1 | 1 = last.x0 >= first.x0 ? 1 : -1;
      const nextY = floorHeight(stair.tower, stair.floor + 1);
      const b = hillBounds(stair.crates);
      const c = cross(
        stair.tower,
        dir > 0 ? first.x0 - 1.2 : first.x1 + 1.2,
        first.y0,
        dir,
        sprint,
        // Up on the next slab and clear of the treads. Checked by extent, not
        // "past the last crate": a stair ending at the tower edge wraps x.
        (p) =>
          p.onGround &&
          p.y >= nextY - 0.1 &&
          (p.x > b.right + 0.4 || p.x < b.left - 0.4)
      );
      expectHonest(c, stair.tower, `${stair.tower.seed} floor ${stair.floor}`);
    });
  });
});
