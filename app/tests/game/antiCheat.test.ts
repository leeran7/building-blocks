/**
 * Tower v3 "The Climb" — anti-cheat tests.
 *
 * Covers:
 *   AC-15: illegal inputs / impossible height deltas are rejected; server keeps
 *          the last valid state and flags the input.
 *   AC-16: K consecutive illegal deltas flag the player (voids ranked payout).
 *   AC-18: the server never trusts a client-reported position — validateInput
 *          only accepts intent fields, never a position.
 */

import { describe, it, expect } from "vitest";
import {
  validateInput,
  isHeightDeltaLegal,
  legalClimbSpeedMult,
  newSentinel,
  updateSentinel,
} from "../../src/game/antiCheat";
import { createMatch, spawnPlayer, stepMatch } from "../../src/game/simulation";
import { buildTower, laddersForFloor } from "../../src/game/towers";
import { RAPID_CLIMB_MULT, JETPACK_MAX_VY, POWER_UP_HOVER_M, jetpackFuelTicks } from "../../src/game/powerups";
import { checkClimbResult } from "../../src/game/scoreBounds";
import { TowerSpec, TICK_DT, TICK_HZ, NO_INPUT } from "../../src/game/types";

const TOWER: TowerSpec = {
  categorySlug: "t",
  widthM: 100,
  floorGap: 24,
  seed: "t",
  ladderGrabRadius: 2,
  maxClimbSpeed: 8,
  moveSpeed: 6,
  jumpSpeed: 10,
  gravity: 24,
  fallDeathBelowPeakM: 40,
};

describe("AC-15 / AC-18: input validation trusts only intent", () => {
  it("rejects malformed (non-object) input and returns NO_INPUT", () => {
    const p = spawnPlayer("p1", 0);
    const v = validateInput("teleport-to-flag", p);
    expect(v.rejected).toBe(true);
    expect(v.input).toEqual({ moveX: 0, jump: false, climbY: 0, usePowerUp: false });
  });

  it("ignores any client-supplied position/height field (AC-18)", () => {
    const p = spawnPlayer("p1", 0);
    // A malicious client tries to smuggle a y position; validateInput drops it.
    const v = validateInput({ moveX: 1, jump: false, climbY: 0, y: 999, x: 5 }, p);
    expect(v.input).not.toHaveProperty("y");
    expect(v.input).toEqual({ moveX: 1, jump: false, climbY: 0, usePowerUp: false });
  });

  it("allows climb intent off a ladder so the sim can grab one", () => {
    const p = spawnPlayer("p1", 0);
    p.onLadder = false;
    const v = validateInput({ moveX: 0, jump: false, climbY: 1, usePowerUp: false }, p);
    expect(v.input.climbY).toBe(1);
    expect(v.rejected).toBe(false);
  });

  it("allows a climb input when the player is on a ladder", () => {
    const p = spawnPlayer("p1", 0);
    p.onLadder = true;
    const v = validateInput({ moveX: 0, jump: false, climbY: 1, usePowerUp: false }, p);
    expect(v.input.climbY).toBe(1);
    expect(v.rejected).toBe(false);
  });

  it("blocks an air-jump (jump while airborne, not on ladder)", () => {
    const p = spawnPlayer("p1", 0);
    p.onGround = false;
    p.onLadder = false;
    const v = validateInput({ moveX: 0, jump: true, climbY: 0, usePowerUp: false }, p);
    expect(v.input.jump).toBe(false);
    expect(v.rejected).toBe(true);
  });
});

describe("AC-15: height-rate sentinel", () => {
  const maxGain = TOWER.maxClimbSpeed * TICK_DT;

  it("accepts a legal per-tick height gain", () => {
    expect(isHeightDeltaLegal(100, 100 + maxGain, TOWER)).toBe(true);
  });

  it("rejects an impossible per-tick height jump", () => {
    expect(isHeightDeltaLegal(100, 100 + maxGain + 5, TOWER)).toBe(false);
  });

  it("accepts a launch at the tower's own jump speed", () => {
    // The bound used to be the ladder climb rate alone, so the first tick of
    // any jump was illegal on every archetype: jumpSpeed exceeds
    // maxClimbSpeed everywhere.
    const jumpGain = TOWER.jumpSpeed * TICK_DT;
    expect(jumpGain).toBeGreaterThan(maxGain);
    expect(isHeightDeltaLegal(100, 100 + jumpGain, TOWER)).toBe(true);
  });

  it("accepts a JETPACK_MAX_VY delta that exceeds this tower's jump and climb", () => {
    expect(TOWER.jumpSpeed).toBeLessThan(JETPACK_MAX_VY);
    expect(TOWER.maxClimbSpeed).toBeLessThan(JETPACK_MAX_VY);
    const packGain = JETPACK_MAX_VY * TICK_DT;
    expect(packGain).toBeGreaterThan(TOWER.jumpSpeed * TICK_DT);
    expect(isHeightDeltaLegal(100, 100 + packGain, TOWER)).toBe(true);
  });

  it("still rejects a delta above the full vertical envelope", () => {
    const envelope =
      Math.max(TOWER.maxClimbSpeed, TOWER.jumpSpeed, JETPACK_MAX_VY) * TICK_DT;
    expect(isHeightDeltaLegal(100, 100 + envelope * 2, TOWER)).toBe(false);
  });

  it("widens for rapid-climb without narrowing for anything else", () => {
    const rapidGain = TOWER.maxClimbSpeed * RAPID_CLIMB_MULT * TICK_DT;
    expect(isHeightDeltaLegal(100, 100 + rapidGain, TOWER, 0.01, RAPID_CLIMB_MULT)).toBe(
      true
    );
    expect(isHeightDeltaLegal(100, 100 + JETPACK_MAX_VY * TICK_DT, TOWER, 0.01, 1)).toBe(
      true
    );
  });

  it("uses the three-term max of climb rate, jumpSpeed, and JETPACK_MAX_VY", () => {
    const threeTerm = Math.max(TOWER.maxClimbSpeed, TOWER.jumpSpeed, JETPACK_MAX_VY);
    expect(isHeightDeltaLegal(100, 100 + threeTerm * TICK_DT, TOWER)).toBe(true);
  });
});

describe("AC-16: the sentinel stays silent on honest play", () => {
  // The gap the old tests left: every sentinel assertion used synthetic deltas,
  // so nobody checked the sentinel against heights the simulation actually
  // produces. A real jump used to spend 4 consecutive ticks illegal and a
  // jump power-up 11, against a K of 5.
  const SEEDS = ["honest-1", "honest-2", "honest-3"];

  it.each(SEEDS)("does not flag a jumping, climbing run (%s)", (seed) => {
    const tower = buildTower("ai", { runSeed: seed });
    const match = createMatch({ seed, mode: "solo", tower, playerIds: ["p1"] });
    match.phase = "climb";
    match.tick = 0;

    let sentinel = newSentinel();
    let worstStreak = 0;

    for (let i = 0; i < 30 * TICK_HZ; i++) {
      const player = match.players[0]!;
      const prevY = player.y;
      stepMatch(match, {
        p1: { moveX: i % 40 < 20 ? 1 : -1, jump: true, climbY: 1, usePowerUp: true },
      });
      const legal = isHeightDeltaLegal(
        prevY,
        match.players[0]!.y,
        tower,
        0.01,
        legalClimbSpeedMult(match.players[0]!, match.tick)
      );
      sentinel = updateSentinel(sentinel, legal);
      worstStreak = Math.max(worstStreak, sentinel.consecutiveViolations);
    }

    expect(sentinel.flagged).toBe(false);
    expect(match.players[0]!.cheatFlagged).toBe(false);
    // Nowhere near the K=5 threshold, so a retune has room before it regresses.
    expect(worstStreak).toBeLessThan(3);
  });
});

describe("AC-16: K-consecutive-violation flagging", () => {
  it("flags only after K consecutive illegal deltas, resetting on a legal one", () => {
    let s = newSentinel();
    s = updateSentinel(s, false, 3); // 1
    s = updateSentinel(s, false, 3); // 2
    expect(s.flagged).toBe(false);
    s = updateSentinel(s, true, 3); // reset
    expect(s.consecutiveViolations).toBe(0);
    s = updateSentinel(s, false, 3); // 1
    s = updateSentinel(s, false, 3); // 2
    s = updateSentinel(s, false, 3); // 3 → flag
    expect(s.flagged).toBe(true);
  });
});

describe("stepMatch is the production caller", () => {
  it("clamps an out-of-range moveX so it cannot multiply walk speed", () => {
    // clampAxis only accepts -1/0/1. If stepMatch skipped validateInput, a
    // spoofed moveX of 5 would walk 5× as far in one tick.
    const m = createMatch({
      seed: "anticheat-caller",
      mode: "solo",
      tower: TOWER,
      playerIds: ["p1"],
    });
    m.phase = "climb";
    const x0 = m.players[0].x;
    const spoof = { moveX: 5, jump: false, climbY: 0, usePowerUp: false };
    stepMatch(m, { p1: spoof as never });
    expect(m.players[0].x).toBe(x0);
  });

  it("writes the height sentinel back onto the player", () => {
    // If stepMatch skipped updateSentinel, a leftover streak would stick.
    const m = createMatch({
      seed: "anticheat-sentinel",
      mode: "solo",
      tower: TOWER,
      playerIds: ["p1"],
    });
    m.phase = "climb";
    m.players[0].cheatViolations = 99;
    stepMatch(m, {
      p1: { moveX: 0, jump: false, climbY: 0, usePowerUp: false },
    });
    expect(m.players[0].cheatViolations).toBe(0);
    expect(m.players[0].cheatFlagged).toBe(false);
  });

  it("does not grant height from climbY when no ladder is in reach", () => {
    const tower = buildTower("ai", { runSeed: "climb-off-ladder" });
    const m = createMatch({
      seed: "climb-off-ladder",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    m.phase = "climb";
    const p = m.players[0]!;
    const ladders = laddersForFloor(tower, 0);
    let farX: number | null = null;
    for (let x = 0; x <= tower.widthM; x += 1) {
      if (ladders.every((l) => Math.abs(l.x - x) > tower.ladderGrabRadius + 2)) {
        farX = x;
        break;
      }
    }
    expect(farX).not.toBeNull();
    p.x = farX as number;
    p.y = 0;
    p.onGround = true;
    p.onLadder = false;
    const y0 = p.y;
    for (let i = 0; i < 30; i++) {
      stepMatch(m, {
        p1: { moveX: 0, jump: false, climbY: 1, usePowerUp: false },
      });
    }
    expect(p.onLadder).toBe(false);
    expect(p.y).toBe(y0);
  });

  it("lets an airborne jetpack hold gain height (validateInput did not strip it)", () => {
    const m = climbingWithClearOrbs("jetpack-hold");
    const p = m.players[0]!;
    placeTestOrb(m, p.x, p.y);
    stepMatch(m, { p1: NO_INPUT });
    stepMatch(m, {
      p1: { moveX: 0, jump: true, climbY: 0, usePowerUp: false },
    });
    const y0 = p.y;
    stepMatch(m, {
      p1: { moveX: 0, jump: true, climbY: 0, usePowerUp: false },
    });
    expect(p.jetpackThrusting).toBe(true);
    expect(p.y).toBeGreaterThan(y0);
  });
});

describe("AC-J9: a full jetpack burn does not flag the sentinel", () => {
  it("stays silent across a full-tank hold through stepMatch", () => {
    const m = climbingWithClearOrbs("jetpack-burn");
    const p = m.players[0]!;
    placeTestOrb(m, p.x, p.y);
    const jump = { moveX: 0, jump: true, climbY: 0, usePowerUp: false } as const;
    stepMatch(m, { p1: NO_INPUT });
    stepMatch(m, { p1: jump });
    const tank = jetpackFuelTicks();
    for (let i = 0; i < tank; i++) stepMatch(m, { p1: jump });
    expect(p.cheatFlagged).toBe(false);
    expect(checkClimbResult(p.peakY, m.tick).ok).toBe(true);
  });
});

function climbingWithClearOrbs(seed: string) {
  const tower = buildTower("ai", { runSeed: seed });
  const m = createMatch({ seed, mode: "solo", tower, playerIds: ["p1"] });
  m.phase = "climb";
  m.tick = 0;
  m.powerUps = [];
  m.powerUpFloorHi = 100_000;
  return m;
}

function placeTestOrb(
  m: ReturnType<typeof climbingWithClearOrbs>,
  x: number,
  feetY: number
): void {
  m.powerUps.push({
    id: "test:jetpack",
    type: "jetpack",
    floorIndex: 0,
    x,
    y: feetY + POWER_UP_HOVER_M,
    collected: false,
    collectedTick: null,
  });
}
