/**
 * Floor spikes (spikes.ts): where they go, that they end a run, and that a
 * jump clears them. Every check drives the real generator and stepMatch.
 */

import { describe, expect, it } from "vitest";
import { createMatch, stepMatch } from "../../src/game/simulation";
import { buildFreeTower } from "../../src/game/freeStack";
import {
  applyRunSeed,
  buildTower,
  floorHeight,
  laddersForFloor,
  platformsForFloor,
} from "../../src/game/towers";
import { obstacleLadderKeepOutM, obstaclesForFloor } from "../../src/game/obstacles";
import {
  SPIKES_ENDLESS,
  SPIKE_CLEAR_M,
  SPIKE_LANDING_REACH_FRAC,
  endedOnSpikes,
  spikesForFloor,
  touchesSpikes,
} from "../../src/game/spikes";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import { levelSpec, levelTower } from "../../src/game/levels/levelSpec";
import { SEASON_1 } from "../../src/game/levels/season";
import { createRouteBot } from "../../src/game/levels/routeBot";
import type { PlayerInput, Spike, TowerSpec } from "../../src/game/types";

const FLOORS = 120;
const NO_LAVA = { hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0 } };
const FREE_SEEDS = ["spk-a", "spk-b", "spk-c", "spk-d", "spk-e"];

function rows(tower: TowerSpec, floors = FLOORS): Spike[] {
  const out: Spike[] = [];
  for (let i = 0; i < floors; i++) out.push(...spikesForFloor(tower, i));
  return out;
}

/** Shortest distance from x to `to` around a tower that wraps. */
function wrapDist(tower: TowerSpec, x: number, to: number): number {
  const w = tower.widthM;
  const d = Math.abs((((x - to) % w) + w) % w);
  return Math.min(d, w - d);
}

describe("spike placement", () => {
  it("the free stack gets spike rows, none below the first spike floor", () => {
    let checked = 0;
    for (const seed of FREE_SEEDS) {
      const all = rows(applyRunSeed(buildFreeTower(), seed));
      expect(all.length).toBeGreaterThan(10);
      for (const s of all) expect(s.floorIndex).toBeGreaterThanOrEqual(SPIKES_ENDLESS.fromFloor);
      checked += all.length;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("every row is jumpable, and never where a jump over a crate or a gap lands", () => {
    let checked = 0;
    for (const seed of FREE_SEEDS) {
      const tower = applyRunSeed(buildFreeTower(), seed);
      const reach = ((2 * tower.jumpSpeed) / tower.gravity) * tower.moveSpeed;
      for (const s of rows(tower)) {
        expect(s.x1 - s.x0).toBeGreaterThan(1);
        expect(s.x1 - s.x0).toBeLessThanOrEqual(reach / 2);
        expect(s.y).toBe(floorHeight(tower, s.floorIndex));
        // On one platform piece: a landing's length from a gap edge, and
        // SPIKE_CLEAR_M from a wall (the floor wraps on round there).
        const landing = SPIKE_LANDING_REACH_FRAC * reach;
        const piece = platformsForFloor(tower, s.floorIndex).find((p) => s.x0 >= p.x0 && s.x1 <= p.x1);
        expect(piece).toBeDefined();
        const lo = piece!.x0 <= 1e-9 ? SPIKE_CLEAR_M : landing;
        const hi = piece!.x1 >= tower.widthM - 1e-9 ? SPIKE_CLEAR_M : landing;
        expect(s.x0 - piece!.x0).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(piece!.x1 - s.x1).toBeGreaterThanOrEqual(hi - 1e-9);
        // A landing's length from every crate on the floor, around the wrap.
        for (const o of obstaclesForFloor(tower, s.floorIndex)) {
          for (const x of [s.x0, s.x1]) {
            const d = Math.min(wrapDist(tower, x, o.x0), wrapDist(tower, x, o.x1));
            expect(d).toBeGreaterThanOrEqual(landing - 1e-9);
          }
        }
        // Clear of every ladder you arrive on or leave from, around the wrap.
        const keep = obstacleLadderKeepOutM(tower);
        const ladders = [
          ...laddersForFloor(tower, s.floorIndex),
          ...laddersForFloor(tower, s.floorIndex - 1),
        ];
        for (const l of ladders) {
          for (const x of [s.x0, s.x1, (s.x0 + s.x1) / 2]) {
            expect(wrapDist(tower, x, l.x)).toBeGreaterThan(keep);
          }
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("is a pure function of the seed", () => {
    const a = rows(applyRunSeed(buildFreeTower(), "spk-a"));
    const b = rows({ ...applyRunSeed(buildFreeTower(), "spk-a") });
    expect(b).toEqual(a);
    expect(rows(applyRunSeed(buildFreeTower(), "spk-b"))).not.toEqual(a);
  });

  it("duel and category towers never get spikes", () => {
    for (const slug of ["indie-games", "developer-tools", "fitness-and-wellness"]) {
      expect(rows(buildTower(slug, { runSeed: "spk-a" }))).toEqual([]);
    }
  });

  it("levels have none before the season's spike level, and some from it on", () => {
    const intro = SEASON_1.obstacleIntros.spikes;
    for (let n = 1; n < intro; n++) {
      const spec = levelSpec(SEASON_1, n);
      expect(spec.layout.spikeChance).toBe(0);
      expect(rows(levelTower(spec), 60)).toEqual([]);
    }
    // The intro level itself shows some below its summit.
    const introSpec = levelSpec(SEASON_1, intro);
    const introTower = levelTower(introSpec);
    expect(rows(introTower, 60).filter((r) => r.y < introSpec.goalFt).length).toBeGreaterThan(0);
    let later = 0;
    for (let n = intro; n < intro + 20; n++) later += rows(levelTower(levelSpec(SEASON_1, n)), 60).length;
    expect(later).toBeGreaterThan(0);
  });
});

/** A free tower and the first spike row on it, with the floor's nearest open run-up. */
function firstRow(seed: string): { tower: TowerSpec; row: Spike } {
  const tower = applyRunSeed(buildFreeTower(), seed);
  const row = rows(tower)[0];
  expect(row).toBeDefined();
  return { tower, row: row! };
}

/** Stand a climber on the row's floor `lead` m before it and hold `input` for 2 s. */
function runAt(tower: TowerSpec, row: Spike, lead: number, input: (tick: number) => PlayerInput) {
  const m = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: ["p"] });
  m.phase = "climb";
  m.tick = 0;
  const p = m.players[0];
  p.x = row.x0 - lead;
  p.y = row.y;
  p.peakY = row.y;
  p.onGround = true;
  for (let t = 0; t < 60 && p.status === "climbing"; t++) stepMatch(m, { p: input(t) }, NO_LAVA);
  return p;
}

describe("spikes in the real stepMatch", () => {
  it("walking into a row ends the run on the row", () => {
    const { tower, row } = firstRow("spk-a");
    const walk: PlayerInput = { moveX: 1, jump: false, climbY: 0, usePowerUp: false };
    const p = runAt(tower, row, 2, () => walk);
    expect(p.status).toBe("eliminated");
    expect(p.x).toBeGreaterThan(row.x0);
    expect(p.x).toBeLessThan(row.x1);
    expect(endedOnSpikes(tower, p)).toBe(true);
  });

  it("a climber the lava catches did not end on spikes", () => {
    const tower = applyRunSeed(buildFreeTower(), "spk-a");
    const m = createMatch({ seed: tower.seed, mode: "solo", tower, playerIds: ["p"] });
    m.phase = "climb";
    m.tick = 0;
    const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
    for (let t = 0; t < 60 * 30 && m.players[0].status === "climbing"; t++) stepMatch(m, { p: idle });
    expect(m.players[0].status).toBe("eliminated");
    expect(endedOnSpikes(tower, m.players[0])).toBe(false);
  });

  it("standing next to a row is safe (control)", () => {
    const { tower, row } = firstRow("spk-a");
    const idle: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
    expect(runAt(tower, row, 1, () => idle).status).toBe("climbing");
  });

  it("a running jump just before a row clears it", () => {
    const { tower, row } = firstRow("spk-a");
    const p = runAt(tower, row, 1.5, (t) => ({ moveX: 1, jump: t === 0, climbY: 0, usePowerUp: false }));
    expect(p.status).toBe("climbing");
    expect(p.x).toBeGreaterThan(row.x1);
  });

  it("touchesSpikes is false off the row and true inside it", () => {
    const { tower, row } = firstRow("spk-b");
    const mid = (row.x0 + row.x1) / 2;
    expect(touchesSpikes(tower, mid, row.y)).toBe(true);
    expect(touchesSpikes(tower, mid + tower.widthM, row.y)).toBe(true);
    expect(touchesSpikes(tower, row.x0 - 0.5, row.y)).toBe(false);
    expect(touchesSpikes(tower, mid, row.y + 3)).toBe(false);
  });

  it("the route bot climbs past every spike row on the free stack", () => {
    let passed = 0;
    for (const seed of FREE_SEEDS) {
      const tower = applyRunSeed(buildFreeTower(), seed);
      const m = createMatch({ seed, mode: "solo", tower, playerIds: ["bot"] });
      while (m.phase === "countdown") stepMatch(m, {}, NO_LAVA);
      const bot = createRouteBot();
      while (m.phase === "climb" && m.tick < 120 * 30) {
        stepMatch(m, { bot: bot(m.players[0], tower, m.tick) }, NO_LAVA);
      }
      const p = m.players[0];
      expect(p.status, seed).toBe("climbing");
      passed += rows(tower).filter((s) => s.y < p.peakY).length;
    }
    expect(passed).toBeGreaterThan(0);
  });
});
