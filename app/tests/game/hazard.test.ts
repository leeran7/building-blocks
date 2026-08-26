/**
 * Tower v3 "The Climb" — rising-hazard tests.
 *
 * The hazard rises at a speed that is a FRACTION OF THE CLIMBER'S SPEED, so the
 * chase is proportional to how fast the player can move (spec-next.md, AC-5/AC-6):
 *   - starts below the base (head-start), then rises;
 *   - accelerates from startSpeedFrac → endSpeedFrac over rampSeconds;
 *   - is monotonic and bounded by the tower height;
 *   - scales linearly with the climb speed.
 */

import { describe, it, expect } from "vitest";
import {
  hazardHeightAt,
  hazardHasReached,
  DEFAULT_HAZARD_CONFIG,
} from "../../src/game/hazard";

const CFG = DEFAULT_HAZARD_CONFIG;
const CLIMB = 9; // reference climb speed (m/s)

describe("AC-5: hazard rise is proportional to the climber's speed", () => {
  it("starts below the base at t=0 (head-start), so a spawning climber is safe", () => {
    const h0 = hazardHeightAt(0, CLIMB, CFG);
    expect(h0).toBeCloseTo(-CFG.headStartM, 9);
    expect(h0).toBeLessThan(0);
  });

  it("holds below the base during the opening grace, then rises", () => {
    // Flat (below base) through the grace window, then it starts climbing.
    expect(hazardHeightAt(CFG.graceSeconds - 0.1, CLIMB, CFG)).toBeCloseTo(
      -CFG.headStartM,
      6
    );
    expect(hazardHeightAt(CFG.graceSeconds + 2, CLIMB, CFG)).toBeGreaterThan(
      -CFG.headStartM
    );
  });

  it("rises at a fraction of the climb speed just after the grace", () => {
    // Over a small dt after the grace, average speed ≈ startSpeedFrac · climb.
    const t0 = CFG.graceSeconds;
    const dt = 0.5;
    const dh = hazardHeightAt(t0 + dt, CLIMB, CFG) - hazardHeightAt(t0, CLIMB, CFG);
    const approxSpeed = dh / dt;
    expect(approxSpeed).toBeGreaterThan(0);
    // Within ~15% of startSpeedFrac·climb (a touch higher due to acceleration).
    const expected = CFG.startSpeedFrac * CLIMB;
    expect(approxSpeed).toBeGreaterThan(expected * 0.9);
    expect(approxSpeed).toBeLessThan(expected * 1.15);
  });

  it("scales linearly with the climb speed (a faster climber is chased faster)", () => {
    const t = 12;
    const slow = hazardHeightAt(t, CLIMB, CFG) + CFG.headStartM;
    const fast = hazardHeightAt(t, 2 * CLIMB, CFG) + CFG.headStartM;
    expect(fast).toBeCloseTo(2 * slow, 6);
  });
});

describe("AC-6: hazard rise accelerates, is monotonic, and is bounded", () => {
  it("accelerates: a later interval covers more ground than an earlier one", () => {
    const g = CFG.graceSeconds;
    const early = hazardHeightAt(g + 5, CLIMB, CFG) - hazardHeightAt(g + 4, CLIMB, CFG);
    const late = hazardHeightAt(g + 25, CLIMB, CFG) - hazardHeightAt(g + 24, CLIMB, CFG);
    expect(late).toBeGreaterThan(early);
  });

  it("is monotonically non-decreasing over the race", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 200; t += 2) {
      const h = hazardHeightAt(t, CLIMB, CFG);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("rises without any upper bound (the tower is endless)", () => {
    // Higher and higher forever — no ceiling.
    const a = hazardHeightAt(100, CLIMB, CFG);
    const b = hazardHeightAt(1000, CLIMB, CFG);
    const c = hazardHeightAt(10000, CLIMB, CFG);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(3000); // far above any fixed tower height
    expect(Number.isFinite(c)).toBe(true);
  });

  it("eventually outpaces the climb speed, so every run must end", () => {
    // After the ramp the rise speed exceeds the climb speed (endSpeedFrac > 1).
    const dt = 0.5;
    const late =
      (hazardHeightAt(200 + dt, CLIMB, CFG) - hazardHeightAt(200, CLIMB, CFG)) / dt;
    expect(late).toBeGreaterThan(CLIMB);
  });
});

describe("AC-7: hazardHasReached detects catching a climber", () => {
  it("catches a climber whose feet are at/below the hazard line", () => {
    const t = 30;
    const h = hazardHeightAt(t, CLIMB, CFG);
    expect(hazardHasReached(h, t, CLIMB, CFG)).toBe(true);
    expect(hazardHasReached(h - 0.001, t, CLIMB, CFG)).toBe(true);
    expect(hazardHasReached(h + 0.001, t, CLIMB, CFG)).toBe(false);
  });
});
