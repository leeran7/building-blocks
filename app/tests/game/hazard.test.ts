/**
 * Tower v3 "The Climb" — rising-hazard tests.
 *
 * Covers the engine-reuse ACs from spec-next.md:
 *   AC-5: hazard height is computed from the shipped computeGround(V) with
 *         V = HAZARD_VIEWS_PER_SEC * t (engine functions unmodified).
 *   AC-6: hazard rise is monotonic non-decreasing and bounded by the engine's
 *         MAX_GROWTH cap (never instantaneous).
 *   AC-7: hazardHasReached fires when the top edge meets a climber's feet.
 */

import { describe, it, expect } from "vitest";
import {
  hazardHeightAt,
  hazardHasReached,
  raceTimeToV,
  DEFAULT_HAZARD_CONFIG,
} from "../../src/game/hazard";
import { computeGround } from "../../src/engine/index";

const CFG = DEFAULT_HAZARD_CONFIG;

describe("AC-5: hazard height reuses the engine's computeGround", () => {
  it("maps race-time to V via HAZARD_VIEWS_PER_SEC", () => {
    expect(raceTimeToV(0, CFG)).toBe(0);
    expect(raceTimeToV(10, CFG)).toBe(10 * CFG.HAZARD_VIEWS_PER_SEC);
  });

  it("is a scaled form of computeGround(V(t)) — same curve", () => {
    // At any t, hazard fraction must equal computeGround(V)/computeGround(inf).
    const t = 40;
    const V = raceTimeToV(t, CFG);
    const groundMax = computeGround(Number.POSITIVE_INFINITY);
    const expected = (computeGround(V) / groundMax) * CFG.towerHeightM;
    expect(hazardHeightAt(t, CFG)).toBeCloseTo(expected, 9);
  });

  it("starts near zero at t=0 (engine ground at V=0 is the small G0)", () => {
    const h0 = hazardHeightAt(0, CFG);
    expect(h0).toBeGreaterThanOrEqual(0);
    expect(h0).toBeLessThan(CFG.towerHeightM * 0.2); // tiny fraction of tower
  });
});

describe("AC-6: hazard rise is monotonic and bounded (never instant)", () => {
  it("is monotonically non-decreasing over the race", () => {
    let prev = -1;
    for (let t = 0; t <= 1000; t += 5) {
      const h = hazardHeightAt(t, CFG);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("never exceeds the tower height (bounded by MAX_GROWTH cap)", () => {
    for (const t of [0, 50, 200, 1000, 1e6]) {
      const h = hazardHeightAt(t, CFG);
      expect(h).toBeLessThanOrEqual(CFG.towerHeightM);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it("caps: two far-past-cap times give the same (max) height", () => {
    const a = hazardHeightAt(1e5, CFG);
    const b = hazardHeightAt(1e6, CFG);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
    expect(a).toBeCloseTo(CFG.towerHeightM, 6);
  });
});

describe("AC-7: hazardHasReached detects catching a climber", () => {
  it("catches a climber whose feet are at/below the hazard line", () => {
    const t = 300;
    const h = hazardHeightAt(t, CFG);
    expect(hazardHasReached(h, t, CFG)).toBe(true);
    expect(hazardHasReached(h - 0.001, t, CFG)).toBe(true);
    expect(hazardHasReached(h + 0.001, t, CFG)).toBe(false);
  });
});
