/**
 * Tower v3 "The Climb" — rising-hazard tests.
 *
 * The hazard rises at a speed that is a FRACTION OF THE CLIMBER'S SPEED, so the
 * chase is proportional to how fast the player can move (spec-next.md, AC-5/AC-6):
 *   - starts below the base (head-start), then rises;
 *   - envelope ramps startSpeedFrac → endSpeedFrac over rampSeconds;
 *   - stumbles (slows) on a fixed cycle instead of accelerating at every moment;
 *   - is monotonic;
 *   - scales linearly with the climb speed.
 */

import { describe, it, expect } from "vitest";
import {
  hazardHeightAt,
  hazardHasReached,
  hazardSpeedFracAt,
  hazardMeanSpeedFrac,
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
    // Opening is a surge, so average speed ≈ startSpeedFrac · climb.
    const t0 = CFG.graceSeconds;
    const dt = 0.5;
    const dh = hazardHeightAt(t0 + dt, CLIMB, CFG) - hazardHeightAt(t0, CLIMB, CFG);
    const approxSpeed = dh / dt;
    expect(approxSpeed).toBeGreaterThan(0);
    // Within ~15% of startSpeedFrac·climb (a touch higher due to the envelope ramp).
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

describe("AC-6: hazard rise ramps, stumbles, is monotonic, and is unbounded", () => {
  it("the time-averaged envelope is higher later in the ramp than earlier", () => {
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    const early =
      (hazardHeightAt(g + period, CLIMB, CFG) - hazardHeightAt(g, CLIMB, CFG)) /
      period;
    const late =
      (hazardHeightAt(g + 4 * period, CLIMB, CFG) -
        hazardHeightAt(g + 3 * period, CLIMB, CFG)) /
      period;
    expect(late).toBeGreaterThan(early);
  });

  it("stumbles: a stumble window is slower than the surge that precedes it", () => {
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    const dur = CFG.stumbleDurationSeconds;
    // Second cycle, well into the run so both windows are past grace.
    const surgeStart = g + period;
    const stumbleStart = g + 2 * period - dur;
    const dt = 0.4;
    const surge =
      (hazardHeightAt(surgeStart + dt, CLIMB, CFG) -
        hazardHeightAt(surgeStart, CLIMB, CFG)) /
      dt;
    const stumble =
      (hazardHeightAt(stumbleStart + dt, CLIMB, CFG) -
        hazardHeightAt(stumbleStart, CLIMB, CFG)) /
      dt;
    expect(stumble).toBeLessThan(surge * 0.5);
    expect(stumble).toBeGreaterThan(0);
  });

  it("does not accelerate at every moment — speed drops when a stumble starts", () => {
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    const dur = CFG.stumbleDurationSeconds;
    const before = hazardSpeedFracAt(g + period - dur - 0.05, CFG);
    const during = hazardSpeedFracAt(g + period - dur + 0.05, CFG);
    expect(during).toBeLessThan(before);
    expect(during / before).toBeCloseTo(CFG.stumbleSpeedFrac, 2);
  });

  it("is monotonically non-decreasing over the race", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 200; t += 0.25) {
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

  it("never rises faster than ladder climb speed", () => {
    for (let t = CFG.graceSeconds; t <= 300; t += 0.25) {
      expect(hazardSpeedFracAt(t, CFG)).toBeLessThanOrEqual(1);
    }
  });

  it("still closes in on a dawdling climber over time", () => {
    expect(hazardMeanSpeedFrac(CFG)).toBeCloseTo(0.75, 3);
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    const t = g + CFG.rampSeconds + 40;
    const avg =
      (hazardHeightAt(t + period, CLIMB, CFG) - hazardHeightAt(t, CLIMB, CFG)) /
      period;
    expect(avg).toBeLessThanOrEqual(CLIMB);
    expect(avg / CLIMB).toBeCloseTo(hazardMeanSpeedFrac(CFG), 5);
  });

  it("never lowers the lava, even if stumbleSpeedFrac is hostile", () => {
    const hostile = { ...CFG, stumbleSpeedFrac: -1 };
    let prev = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 40; t += 0.25) {
      const h = hazardHeightAt(t, CLIMB, hostile);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("matches the smooth integral when stumbling is disabled", () => {
    const smooth = {
      ...CFG,
      stumblePeriodSeconds: 0,
      stumbleDurationSeconds: 0,
    };
    const t = CFG.graceSeconds + 30;
    const dt = 0.5;
    const speed =
      (hazardHeightAt(t + dt, CLIMB, smooth) - hazardHeightAt(t, CLIMB, smooth)) /
      dt;
    const expected =
      (CFG.startSpeedFrac +
        ((CFG.endSpeedFrac - CFG.startSpeedFrac) * 30.25) / CFG.rampSeconds) *
      CLIMB;
    expect(speed).toBeCloseTo(expected, 5);
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
