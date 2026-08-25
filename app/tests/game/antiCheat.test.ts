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
  newSentinel,
  updateSentinel,
} from "../../src/game/antiCheat";
import { spawnPlayer } from "../../src/game/simulation";
import { TowerSpec, TICK_DT } from "../../src/game/types";

const TOWER: TowerSpec = {
  categorySlug: "t",
  heightM: 300,
  flagY: 300,
  checkpoints: [0, 100, 200],
  maxClimbSpeed: 8,
  moveSpeed: 6,
  jumpSpeed: 12,
  gravity: 24,
  fallDeathMargin: 20,
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

  it("neutralizes a climb input when the player is not on a ladder", () => {
    const p = spawnPlayer("p1", 0);
    p.onLadder = false;
    const v = validateInput({ moveX: 0, jump: false, climbY: 1, usePowerUp: false }, p);
    expect(v.input.climbY).toBe(0);
    expect(v.rejected).toBe(true);
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
