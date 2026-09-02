/**
 * The peakY plausibility bound.
 *
 * Two things have to hold at once: no honest run may be rejected, and an
 * arbitrary claim must be. The second half is checked against the actual
 * exploit — src/db/climb.ts persists peakY with Math.max onto a public
 * leaderboard, so one accepted bogus request holds rank 1 permanently.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_ASCENT_SPEED_MPS,
  MAX_RUN_TICKS,
  maxReachablePeakY,
  checkClimbResult,
} from "../../src/game/scoreBounds";
import { FASTEST_ARCHETYPE } from "../../src/game/towers";
import { RAPID_CLIMB_MULT, JETPACK_MAX_VY, POWER_UP_HOVER_M, jetpackFuelTicks } from "../../src/game/powerups";
import { TICK_DT, TICK_HZ, NO_INPUT } from "../../src/game/types";
import { buildTower, floorHeight } from "../../src/game/towers";
import { createMatch, stepMatch } from "../../src/game/simulation";

describe("MAX_ASCENT_SPEED_MPS", () => {
  it("is derived from the fastest archetype and strongest ascent power-up", () => {
    expect(MAX_ASCENT_SPEED_MPS).toBe(
      Math.max(
        FASTEST_ARCHETYPE.maxClimbSpeed * RAPID_CLIMB_MULT,
        FASTEST_ARCHETYPE.jumpSpeed,
        JETPACK_MAX_VY
      )
    );
  });

  it("is at least as fast as every archetype's unaided climb and jump", () => {
    // Nothing in the tuning table may exceed the bound, or honest runs break.
    for (const slug of ["ai", "gaming-pc", "design-tools"]) {
      const tower = buildTower(slug);
      expect(MAX_ASCENT_SPEED_MPS).toBeGreaterThanOrEqual(tower.maxClimbSpeed);
      expect(MAX_ASCENT_SPEED_MPS).toBeGreaterThanOrEqual(
        tower.maxClimbSpeed * RAPID_CLIMB_MULT
      );
      expect(MAX_ASCENT_SPEED_MPS).toBeGreaterThanOrEqual(JETPACK_MAX_VY);
    }
  });
});

describe("checkClimbResult — rejects the impossible", () => {
  it("rejects the unbounded claim that takes rank 1 forever", () => {
    // The exploit: peakY is self-reported and persisted with Math.max.
    expect(checkClimbResult(1e9, 100).ok).toBe(false);
    expect(checkClimbResult(Number.MAX_SAFE_INTEGER, 100).ok).toBe(false);
  });

  it("rejects a claim that is merely slightly too fast", () => {
    const ticks = 1000;
    const ceiling = maxReachablePeakY(ticks);
    expect(checkClimbResult(ceiling * 1.01, ticks).ok).toBe(false);
  });

  it("rejects a long run stretched past the maximum run length", () => {
    // Without this, the height bound scales with a freely chosen tick count.
    expect(checkClimbResult(1e6, MAX_RUN_TICKS + 1).ok).toBe(false);
  });

  it("rejects a missing tick count rather than trusting the height", () => {
    expect(checkClimbResult(5000, null).ok).toBe(false);
  });

  it("rejects non-finite and negative values", () => {
    expect(checkClimbResult(Number.POSITIVE_INFINITY, 100).ok).toBe(false);
    expect(checkClimbResult(Number.NaN, 100).ok).toBe(false);
    expect(checkClimbResult(-1, 100).ok).toBe(false);
    expect(checkClimbResult(100, Number.NaN).ok).toBe(false);
    expect(checkClimbResult(100, -1).ok).toBe(false);
  });

  it("gives a reason naming the ceiling it was measured against", () => {
    const result = checkClimbResult(1e9, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("exceeds");
  });
});

describe("checkClimbResult — accepts the possible", () => {
  it("accepts a zero-height run", () => {
    expect(checkClimbResult(0, 0).ok).toBe(true);
  });

  it("accepts a run exactly at the ceiling", () => {
    const ticks = 1000;
    expect(checkClimbResult(maxReachablePeakY(ticks), ticks).ok).toBe(true);
  });

  it("accepts a run at the maximum run length", () => {
    expect(checkClimbResult(maxReachablePeakY(MAX_RUN_TICKS), MAX_RUN_TICKS).ok).toBe(
      true
    );
  });

  it("leaves headroom above a sustained maximum-speed ladder climb", () => {
    // A player holding the fastest ladder under rapid-climb for a full minute.
    const ticks = 60 * TICK_HZ;
    const climbed = FASTEST_ARCHETYPE.maxClimbSpeed * RAPID_CLIMB_MULT * ticks * TICK_DT;
    expect(checkClimbResult(climbed, ticks).ok).toBe(true);
  });

  it("accepts a peak measured from the real simulation", () => {
    // The bound must not reject what the game itself produces. Drive a real
    // match upward and submit its own peakY against its own tick count.
    const tower = buildTower("ai", { runSeed: "bound-check" });
    const match = createMatch({
      seed: "bound-check",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    match.phase = "climb";
    match.tick = 0;

    for (let i = 0; i < 20 * TICK_HZ; i++) {
      stepMatch(match, {
        p1: { moveX: 0, jump: true, climbY: 1, usePowerUp: true },
      });
    }
    const player = match.players[0]!;

    expect(player.peakY).toBeGreaterThan(0);
    expect(checkClimbResult(player.peakY, match.tick).ok).toBe(true);
  });

  it("accepts a peak measured from a real jetpack thrust run", () => {
    const tower = buildTower("ai", { runSeed: "jetpack-bound" });
    const match = createMatch({
      seed: "jetpack-bound",
      mode: "solo",
      tower,
      playerIds: ["p1"],
    });
    match.phase = "climb";
    match.tick = 0;
    match.powerUps = [];
    match.powerUpFloorHi = 100_000;
    const player = match.players[0]!;
    match.powerUps.push({
      id: "test:jetpack",
      type: "jetpack",
      floorIndex: 0,
      x: player.x,
      y: player.y + POWER_UP_HOVER_M,
      collected: false,
      collectedTick: null,
    });
    const jump = { moveX: 0, jump: true, climbY: 0, usePowerUp: false } as const;
    stepMatch(match, { p1: NO_INPUT });
    stepMatch(match, { p1: jump });
    const tank = jetpackFuelTicks();
    for (let i = 0; i < tank; i++) stepMatch(match, { p1: jump });
    expect(player.peakY).toBeGreaterThan(0);
    expect(checkClimbResult(player.peakY, match.tick).ok).toBe(true);
  });

  it("accepts a climb spanning many floors of real geometry", () => {
    // Guards the bound against a floorGap retune making legitimate heights
    // grow faster than the tick budget allows.
    const tower = buildTower("ai");
    const ticksForFloor50 =
      Math.ceil(floorHeight(tower, 50) / MAX_ASCENT_SPEED_MPS / TICK_DT) + 1;
    expect(checkClimbResult(floorHeight(tower, 50), ticksForFloor50).ok).toBe(true);
  });
});
