/**
 * Tower v3 "The Climb" — simulation core tests (endless model).
 *
 * The tower is endless — no summit, no win. A run ends only when the climber is
 * caught (by the rising lava or a fall behind their peak); peak height is the
 * score. Covers:
 *   Motion: walk, jump, land on platforms, walk off edges, grab + climb ladders.
 *   Death:  caught by the death line eliminates and retains peak (AC-7/AC-8).
 *   Endless completability: a greedy bot climbs far up a generated tower.
 *   AC-11:  re-simulation from (seed, input log) is bit-identical.
 *   resolveOutcome: winner/tie-break logic (for future multiplayer).
 */

import { describe, it, expect } from "vitest";
import {
  createMatch,
  stepMatch,
  spawnPlayer,
  simulateFromInputs,
  SimConfig,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import {
  MatchState,
  PlayerInput,
  PlayerState,
  TowerSpec,
  PlayerId,
  NO_INPUT,
} from "../../src/game/types";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import {
  buildTower,
  ladderForFloor,
  laddersForFloor,
  platformsForFloor,
  floorHeight,
  floorIndexAt,
  platformsNearY,
} from "../../src/game/towers";
import { obstacleAhead } from "../../src/game/obstacles";

const TOWER: TowerSpec = buildTower("indie-games");

const UP: PlayerInput = { moveX: 0, jump: false, climbY: 1, usePowerUp: false };
const IDLE = NO_INPUT;
function move(dir: -1 | 0 | 1, jump = false): PlayerInput {
  return { moveX: dir, jump, climbY: 0, usePowerUp: false };
}

/** Force a match straight into the climb phase (skip countdown for unit focus). */
function climbingMatch(
  mode: MatchState["mode"],
  ids: PlayerId[],
  tower: TowerSpec = TOWER
): MatchState {
  const m = createMatch({ seed: "test-seed", mode, tower, playerIds: ids });
  m.phase = "climb";
  m.tick = 0;
  return m;
}

/** Slow-hazard config so the hazard does not interfere with pure-motion tests. */
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 0.001 },
};
/** Aggressive hazard that catches anything below it this tick. */
const FAST: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, speedScale: 1e6 },
};

describe("motion: walk, jump, land, and fall off edges", () => {
  it("walks horizontally along the base platform while staying grounded", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    const x0 = p.x;
    stepMatch(m, { p1: move(1) }, SLOW);
    expect(p.x).toBeGreaterThan(x0);
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(0);
  });

  it("jumps off the ground and lands back on the platform", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    stepMatch(m, { p1: move(0, true) }, SLOW); // launch
    expect(p.onGround).toBe(false);
    expect(p.vy).toBeGreaterThan(0);
    let ticks = 0;
    while (!p.onGround && ticks < 200) {
      stepMatch(m, { p1: IDLE }, SLOW);
      ticks++;
    }
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(0);
  });

  it("falls off the inner edge of a platform into a gap", () => {
    // Find a floor that has a gap (two platform pieces).
    let gapFloor = -1;
    let pieces = platformsForFloor(TOWER, 1);
    for (let i = 1; i < 200; i++) {
      const ps = platformsForFloor(TOWER, i);
      if (ps.length === 2) {
        gapFloor = i;
        pieces = ps;
        break;
      }
    }
    expect(gapFloor).toBeGreaterThan(0);
    const y = floorHeight(TOWER, gapFloor);
    const leftPiece = pieces[0];
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.x = leftPiece.x1 - 0.5; // right at the gap's left edge
    p.y = y;
    p.peakY = y;
    p.onGround = true;
    let fell = false;
    for (let i = 0; i < 40 && !fell; i++) {
      stepMatch(m, { p1: move(1) }, SLOW);
      if (p.y < y - 1) fell = true; // dropped below the floor
    }
    expect(fell).toBe(true);
  });
});

describe("ladders: grab and climb from one floor to the next", () => {
  it("grabs the floor-0 ladder and climbs up to floor 1", () => {
    const l0 = ladderForFloor(TOWER, 0);
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.x = l0.x; // at the ladder base
    p.y = 0;
    p.onGround = true;
    let ticks = 0;
    const top = floorHeight(TOWER, 1);
    while (p.y < top && ticks < 300) {
      stepMatch(m, { p1: UP }, SLOW);
      ticks++;
    }
    expect(p.y).toBeGreaterThanOrEqual(top);
    expect(p.status).toBe("climbing");
  });
});

describe("ladder dismount: a held climb button does not re-stick you to a ladder", () => {
  // The mobile stuck-after-ladder bug: the only climb control on touch is a held
  // "up" button, so it is still down when you top out. If another ladder leaves
  // the surface you step onto within grab radius, a per-tick grab snapped you
  // straight back and you couldn't walk away. Find such a surface so the test
  // exercises exactly that geometry.
  const UP_RIGHT: PlayerInput = { moveX: 1, jump: false, climbY: 1, usePowerUp: false };

  function findReGrabFloor(tower: TowerSpec): { floor: number; ladderX: number } {
    for (let i = 0; i < 120; i++) {
      const climbed = ladderForFloor(tower, i); // top lands on floor i+1
      const leaving = laddersForFloor(tower, i + 1); // ladders off that surface
      if (leaving.some((b) => Math.abs(b.x - climbed.x) <= tower.ladderGrabRadius)) {
        return { floor: i, ladderX: climbed.x };
      }
    }
    throw new Error("no floor with a re-grabbable ladder above found");
  }

  function climbToTop(tower: TowerSpec): { m: MatchState; p: PlayerState; floor: number } {
    const { floor, ladderX } = findReGrabFloor(tower);
    const m = climbingMatch("solo", ["p1"], tower);
    const p = m.players[0];
    p.x = ladderX;
    p.y = floorHeight(tower, floor);
    p.peakY = p.y;
    p.onGround = true;
    const top = floorHeight(tower, floor + 1);
    for (let t = 0; t < 400 && p.y < top; t++) stepMatch(m, { p1: UP }, SLOW);
    expect(p.onLadder).toBe(false);
    expect(p.y).toBeGreaterThanOrEqual(top);
    return { m, p, floor };
  }

  it("lets the climber walk off the top with the climb button still held", () => {
    const tower = buildTower("indie-games");
    const { m, p } = climbToTop(tower);
    const xAtTop = p.x;
    // Keep holding climb AND press right — the touch case where the climb finger
    // is still down. The player must move, not snap back onto a ladder.
    for (let k = 0; k < 6; k++) stepMatch(m, { p1: UP_RIGHT }, SLOW);
    expect(p.onLadder).toBe(false);
    expect(p.x).toBeGreaterThan(xAtTop + 1.5);
  });

  it("still grabs a ladder once the climb button is released and pressed again", () => {
    const tower = buildTower("indie-games");
    const { m, p } = climbToTop(tower);
    // Release for a tick (clears the suppression), then a deliberate press grabs.
    stepMatch(m, { p1: IDLE }, SLOW);
    let grabbed = false;
    for (let k = 0; k < 10 && !grabbed; k++) {
      stepMatch(m, { p1: UP }, SLOW);
      grabbed = p.onLadder;
    }
    expect(grabbed).toBe(true);
  });
});

describe("AC-7 / AC-8: caught by the death line eliminates and retains peak", () => {
  it("eliminates a caught climber but keeps peakY (solo & multiplayer)", () => {
    for (const mode of ["solo", "multiplayer"] as const) {
      const m = climbingMatch(mode, ["p1"]);
      m.tick = 200; // past the hazard's opening grace so FAST can catch
      const p = m.players[0];
      p.onGround = false;
      p.y = 40;
      p.peakY = 120; // climbed high earlier, then fell back
      stepMatch(m, { p1: IDLE }, FAST);
      expect(p.status).toBe("eliminated");
      expect(p.peakY).toBe(120);
      expect(p.finishedTick).toBe(m.tick);
      expect(m.phase).toBe("finished"); // solo run ends on a catch
    }
  });

  it("kills a climber who falls more than fallDeathBelowPeakM below their peak", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.onGround = false;
    p.peakY = 200;
    p.y = 200 - TOWER.fallDeathBelowPeakM - 1; // dropped past the fall floor
    stepMatch(m, { p1: IDLE }, SLOW);
    expect(p.status).toBe("eliminated");
    expect(p.finishedTick).toBe(m.tick);
  });

  it("has no summit: a very high climber is still climbing, never 'finished'", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.y = 100_000;
    p.peakY = 100_000;
    stepMatch(m, { p1: UP }, SLOW);
    expect(p.status).toBe("climbing"); // endless — no finish line
  });
});

describe("endless completability: a greedy bot climbs far up a generated tower", () => {
  function botInput(p: PlayerState, tower: TowerSpec): PlayerInput {
    if (p.onLadder) return UP;
    const k = floorIndexAt(tower, p.y + 0.5);
    const ladders = laddersForFloor(tower, k);
    const pieces = platformsForFloor(tower, k);
    const piece = pieces.find(
      (pl) =>
        p.x >= pl.x0 - 0.15 &&
        p.x <= pl.x1 + 0.15 &&
        Math.abs(pl.y - p.y) <= 0.25
    );
    const local = piece
      ? ladders.filter((l) => l.x >= piece.x0 && l.x <= piece.x1)
      : [];
    const target = (local.length > 0 ? local : ladders)
      .slice()
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const dx = target.x - p.x;
    if (Math.abs(dx) <= tower.ladderGrabRadius * 0.5) return UP;
    const dir: -1 | 0 | 1 = dx > 0 ? 1 : -1;
    const probe = p.x + dir * 3.5;
    const ahead = platformsNearY(tower, p.y, p.y).some(
      (pl) => probe >= pl.x0 && probe <= pl.x1 && Math.abs(pl.y - p.y) <= 0.05
    );
    const crate = obstacleAhead(tower, p.x, p.y, dir);
    return {
      moveX: dir,
      jump: p.onGround && (!ahead || crate),
      climbY: 0,
      usePowerUp: false,
    };
  }

  for (const slug of ["indie-games", "developer-tools", "fitness-and-wellness"]) {
    it(`climbs high up the ${slug} tower under a slow hazard (solvable + unbounded)`, () => {
      const tower = buildTower(slug);
      const m = climbingMatch("solo", ["bot"], tower);
      let ticks = 0;
      while (m.phase === "climb" && ticks < 8000) {
        stepMatch(m, { bot: botInput(m.players[0], tower) }, SLOW);
        ticks++;
      }
      // Reached well beyond the difficulty ramp — many floors are solvable.
      expect(m.players[0].peakY).toBeGreaterThan(600);
    });
  }

  it("ends the run under the real hazard, with progress recorded", () => {
    const tower = buildTower("indie-games");
    const m = climbingMatch("solo", ["bot"], tower);
    let ticks = 0;
    while (m.phase === "climb" && ticks < 20000) {
      stepMatch(m, { bot: botInput(m.players[0], tower) }, DEFAULT_SIM_CONFIG);
      ticks++;
    }
    expect(m.phase).toBe("finished");
    expect(m.players[0].status).toBe("eliminated");
    expect(m.players[0].peakY).toBeGreaterThan(80); // real climbing happened
  });
});

describe("AC-11: re-simulation is deterministic", () => {
  it("produces bit-identical final state from the same seed + input log", () => {
    const init = {
      seed: "determinism-seed",
      mode: "multiplayer" as const,
      tower: TOWER,
      playerIds: ["p1", "p2"],
    };
    const log: Record<PlayerId, PlayerInput>[] = [];
    for (let i = 0; i < 400; i++) log.push({ p1: UP, p2: move(1, i % 20 === 0) });

    const a = simulateFromInputs(init, log, SLOW);
    const b = simulateFromInputs(init, log, SLOW);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(spawnPlayer("p1", 0)).toEqual(spawnPlayer("p1", 0));
  });
});

describe("resolveOutcome: deterministic winner + tie-break (future multiplayer)", () => {
  it("breaks a same-tick finish tie by lowest slot", () => {
    const m = climbingMatch("multiplayer", ["p1", "p2"]);
    // Manually mark both finished on the same tick (endless solo never does this,
    // but the resolver still governs a future multiplayer race-to-a-height).
    for (const p of m.players) {
      p.status = "finished";
      p.finishedTick = 42;
    }
    stepMatch(m, { p1: IDLE, p2: IDLE }, SLOW);
    expect(m.winnerId).toBe("p1"); // slot 0 wins the tie
    expect(m.phase).toBe("finished");
  });
});

describe("regression: a climber can move from the base; idling loses", () => {
  it("hazard starts below the base and the climber gains height by climbing", () => {
    const tower = buildTower("indie-games");
    const m = climbingMatch("solo", ["p1"], tower);
    stepMatch(m, { p1: IDLE }, DEFAULT_SIM_CONFIG);
    expect(m.hazardY).toBeLessThan(0); // lava starts below the base
    const l0 = ladderForFloor(tower, 0);
    for (let i = 0; i < 200 && m.players[0].y < floorHeight(tower, 1); i++) {
      const p = m.players[0];
      const dx = l0.x - p.x;
      const inp = Math.abs(dx) <= 1 ? UP : move(dx > 0 ? 1 : -1);
      stepMatch(m, { p1: inp }, DEFAULT_SIM_CONFIG);
    }
    expect(m.players[0].status).toBe("climbing");
    expect(m.players[0].peakY).toBeGreaterThan(5);
  });

  it("an idle climber is eventually caught and loses", () => {
    const tower = buildTower("indie-games");
    const m = climbingMatch("solo", ["p1"], tower);
    let ticks = 0;
    while (m.phase === "climb" && ticks < 100_000) {
      stepMatch(m, { p1: IDLE }, DEFAULT_SIM_CONFIG);
      ticks++;
    }
    expect(m.phase).toBe("finished");
    expect(m.players[0].status).toBe("eliminated");
  });
});
