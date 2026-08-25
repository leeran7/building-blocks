/**
 * Tower v3 "The Climb" — simulation core tests.
 *
 * Covers:
 *   AC-1: solo run freezes on flag touch, peak recorded.
 *   AC-2: first flag-toucher wins; no second winner.
 *   AC-3: same-tick flag ties broken by earliest tick, then lowest slot.
 *   AC-4: flag finish evaluated BEFORE hazard elimination on the same tick.
 *   AC-7: hazard elimination (multiplayer) / respawn (solo).
 *   AC-8: peakY retained through elimination / respawn.
 *   AC-9/AC-10: fall respawns at last checkpoint / base.
 *   AC-11: re-simulation from (seed, input log) is bit-identical.
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
import { MatchState, PlayerInput, TowerSpec, PlayerId } from "../../src/game/types";
import { DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";

const TOWER: TowerSpec = {
  categorySlug: "indie-games",
  heightM: 300,
  flagY: 300,
  checkpoints: [0, 50, 100, 150, 200, 250],
  maxClimbSpeed: 8,
  moveSpeed: 6,
  jumpSpeed: 12,
  gravity: 24,
  fallDeathMargin: 20,
};

const UP: PlayerInput = { moveX: 0, jump: false, climbY: 1, usePowerUp: false };

/** Force a match straight into the climb phase (skip countdown for unit focus). */
function climbingMatch(mode: MatchState["mode"], ids: PlayerId[]): MatchState {
  const m = createMatch({ seed: "test-seed", mode, tower: TOWER, playerIds: ids });
  m.phase = "climb";
  m.tick = 0;
  // Put everyone on a ladder so climbY drives clean vertical motion.
  for (const p of m.players) p.onLadder = true;
  return m;
}

/** Slow-hazard config so the hazard does not interfere with pure-climb tests. */
const SLOW: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 0.01 },
};

describe("AC-1: solo run finishes on flag touch and records peak", () => {
  it("freezes the match and marks finished when the player reaches the flag", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.y = TOWER.flagY - 0.05; // just below the flag
    stepMatch(m, { p1: UP }, SLOW);
    expect(p.status).toBe("finished");
    expect(m.phase).toBe("finished");
    expect(p.peakY).toBe(TOWER.flagY);
    expect(m.winnerId).toBe("p1");
  });
});

describe("AC-2 / AC-3: first flag-toucher wins deterministically", () => {
  it("declares exactly one winner and does not overwrite it", () => {
    const m = climbingMatch("multiplayer", ["p1", "p2"]);
    m.players[0].y = TOWER.flagY - 0.05; // p1 reaches first
    m.players[1].y = 100;
    stepMatch(m, { p1: UP, p2: UP }, SLOW);
    expect(m.winnerId).toBe("p1");
    expect(m.phase).toBe("finished");

    // A further step must not change the winner.
    const before = m.winnerId;
    stepMatch(m, { p1: UP, p2: UP }, SLOW);
    expect(m.winnerId).toBe(before);
  });

  it("breaks a same-tick tie by lowest slot", () => {
    const m = climbingMatch("multiplayer", ["p1", "p2"]);
    // Both cross the flag on the same tick; p1 has slot 0, p2 slot 1.
    m.players[0].y = TOWER.flagY - 0.05;
    m.players[1].y = TOWER.flagY - 0.05;
    stepMatch(m, { p1: UP, p2: UP }, SLOW);
    expect(m.players[0].finishedTick).toBe(m.players[1].finishedTick);
    expect(m.winnerId).toBe("p1"); // lower slot wins the tie
  });
});

describe("AC-4: flag finish beats hazard on the same tick", () => {
  it("a player at the flag with the hazard at their feet finishes, not dies", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.y = TOWER.flagY - 0.05;
    // Aggressive hazard so hazardY is high this tick, but flag is checked first.
    const fast: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 1e6 },
    };
    stepMatch(m, { p1: UP }, fast);
    expect(p.status).toBe("finished");
    expect(m.hazardY).toBeGreaterThan(0);
  });
});

describe("AC-7 / AC-8: hazard elimination retains peak", () => {
  it("eliminates a caught multiplayer player but keeps peakY", () => {
    const m = climbingMatch("multiplayer", ["p1"]);
    const p = m.players[0];
    p.onLadder = false;
    p.y = 40;
    p.peakY = 120; // climbed high earlier, then fell back
    const fast: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 1e6 },
    };
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false } }, fast);
    expect(p.status).toBe("eliminated");
    expect(p.peakY).toBe(120); // retained
  });

  it("respawns a caught solo player at the last checkpoint with a penalty", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.onLadder = false;
    p.y = 40;
    p.lastCheckpoint = 3; // 150m
    p.peakY = 160;
    const fast: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 1e6 },
      respawnPenaltyTicks: 30,
    };
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false } }, fast);
    expect(p.status).toBe("climbing");
    expect(p.y).toBe(TOWER.checkpoints[3]); // respawned at checkpoint 3
    expect(p.penaltyTicks).toBe(30);
    expect(p.peakY).toBe(160); // retained (AC-8)
  });
});

describe("AC-9 / AC-10: fall into a gap respawns at last checkpoint / base", () => {
  const FALL: SimConfig = {
    ...DEFAULT_SIM_CONFIG,
    hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 0.01 },
  };

  it("respawns a solo player at their last checkpoint after a gap fall", () => {
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.onLadder = false;
    p.onGround = false;
    p.lastCheckpoint = 4; // 200m
    p.y = TOWER.checkpoints[4] - TOWER.fallDeathMargin - 5; // fell past the margin
    p.peakY = 210;
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false } }, FALL);
    expect(p.status).toBe("climbing");
    expect(p.y).toBe(TOWER.checkpoints[4]);
    expect(p.peakY).toBe(210); // retained
  });

  it("respawns at the base (AC-10) when caught before the first checkpoint", () => {
    // Use the hazard path with lastCheckpoint=0 to exercise the base respawn.
    const m = climbingMatch("solo", ["p1"]);
    const p = m.players[0];
    p.onLadder = false;
    p.y = 10; // above base, below an aggressive hazard
    p.lastCheckpoint = 0; // never passed a checkpoint
    const fast: SimConfig = {
      ...DEFAULT_SIM_CONFIG,
      hazard: { ...DEFAULT_HAZARD_CONFIG, HAZARD_VIEWS_PER_SEC: 1e6 },
    };
    stepMatch(m, { p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false } }, fast);
    expect(p.status).toBe("climbing");
    expect(p.y).toBe(TOWER.checkpoints[0]); // respawned at base
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
    // Build an input log: both climb every tick for 200 ticks.
    const log: Record<PlayerId, PlayerInput>[] = [];
    for (let i = 0; i < 200; i++) log.push({ p1: UP, p2: UP });

    const a = simulateFromInputs(init, log, SLOW);
    const b = simulateFromInputs(init, log, SLOW);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // And a fresh spawn is identical too (pure spawn).
    expect(spawnPlayer("p1", 0)).toEqual(spawnPlayer("p1", 0));
  });
});
