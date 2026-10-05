/**
 * Tower v3 "The Climb" — rising-hazard tests.
 *
 * The hazard rises at a speed that is a FRACTION OF THE CLIMBER'S SPEED, so the
 * chase is proportional to how fast the player can move (spec-next.md, AC-5/AC-6):
 *   - starts below the base (head-start), then rises;
 *   - envelope ramps startSpeedFrac → endSpeedFrac over rampSeconds, then
 *     creeps by creepPerMinute up to the 1× cap (late-game creep, R2-2);
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
  hazardCatchupTimeScale,
  hazardPhase,
  HAZARD_LEASH_M,
  HAZARD_LEASH_RANGE_M,
  HAZARD_CATCHUP_MAX_SCALE,
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

  it("is monotonically non-decreasing over the race (ramp, creep and cap)", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 600; t += 0.25) {
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
    for (let t = CFG.graceSeconds; t <= 900; t += 0.25) {
      expect(hazardSpeedFracAt(t, CFG)).toBeLessThanOrEqual(1);
    }
  });

  it("still closes in on a dawdling climber over time", () => {
    expect(hazardMeanSpeedFrac(CFG)).toBeLessThan(1);
    expect(hazardMeanSpeedFrac(CFG, Infinity)).toBeLessThan(1);
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    // Creep is off here so one cycle's average is exactly the mean.
    const flat = { ...CFG, creepPerMinute: 0 };
    const t = g + CFG.rampSeconds + 40;
    const avg =
      (hazardHeightAt(t + period, CLIMB, flat) - hazardHeightAt(t, CLIMB, flat)) /
      period;
    expect(avg).toBeLessThanOrEqual(CLIMB);
    expect(avg / CLIMB).toBeCloseTo(hazardMeanSpeedFrac(flat), 5);
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

describe("hazardPhase: reports surge/stumble/grace with progress", () => {
  it("returns grace during the opening grace window", () => {
    const info = hazardPhase(2, CFG);
    expect(info.phase).toBe("grace");
    expect(info.progress).toBeCloseTo(2 / CFG.graceSeconds, 6);
  });

  it("returns surge at the start of a cycle (right after grace)", () => {
    const info = hazardPhase(CFG.graceSeconds + 0.1, CFG);
    expect(info.phase).toBe("surge");
    expect(info.progress).toBeGreaterThan(0);
    expect(info.progress).toBeLessThan(0.05);
  });

  it("returns stumble in the last portion of a cycle", () => {
    const stumbleStart = CFG.graceSeconds + CFG.stumblePeriodSeconds - CFG.stumbleDurationSeconds;
    const info = hazardPhase(stumbleStart + 1, CFG);
    expect(info.phase).toBe("stumble");
    expect(info.progress).toBeCloseTo(1 / CFG.stumbleDurationSeconds, 5);
  });

  it("progress reaches ~1 at the end of each phase", () => {
    const cycleEnd = CFG.graceSeconds + CFG.stumblePeriodSeconds - 0.001;
    const info = hazardPhase(cycleEnd, CFG);
    expect(info.phase).toBe("stumble");
    expect(info.progress).toBeGreaterThan(0.99);
  });
});

describe("kill threshold: the documented late-game mean", () => {
  it("time-averaged speed is 0.70× ladder speed when the ramp ends", () => {
    // Pins the documented mean so a cycle edit that silently moves who dies
    // goes red. endSpeedFrac is derived from this and the cycle duty.
    expect(hazardMeanSpeedFrac(DEFAULT_HAZARD_CONFIG)).toBeCloseTo(0.702, 3);
  });

  it("creep lifts the mean to 0.77× at the cap, above the best unaided pace", () => {
    // 0.77 × ladder (10/14 + 4/14 · 0.2) is the late kill threshold (R2-2):
    // every unaided run ends.
    expect(hazardMeanSpeedFrac(DEFAULT_HAZARD_CONFIG, Infinity)).toBeCloseTo(10 / 14 + (4 / 14) * 0.2, 6);
  });

  it("the mean matches the measured rise over the first cycle after the ramp", () => {
    const g = CFG.graceSeconds;
    const period = CFG.stumblePeriodSeconds;
    const t = g + CFG.rampSeconds;
    const avg =
      (hazardHeightAt(t + period, CLIMB, CFG) - hazardHeightAt(t, CLIMB, CFG)) /
      period;
    expect(avg / CLIMB).toBeCloseTo(0.7, 2);
  });

  it("the measured rise over a cycle after the cap is 0.77×", () => {
    const period = CFG.stumblePeriodSeconds;
    const t = 450; // past the ~395 s cap
    const avg =
      (hazardHeightAt(t + period, CLIMB, CFG) - hazardHeightAt(t, CLIMB, CFG)) /
      period;
    expect(avg / CLIMB).toBeCloseTo(10 / 14 + (4 / 14) * 0.2, 6);
  });
});

describe("leash: lava clock scales with how far the climber is beyond it", () => {
  it("runs at 1× at and below the leash", () => {
    for (const lead of [-50, 0, 10, HAZARD_LEASH_M / 2, HAZARD_LEASH_M]) {
      expect(hazardCatchupTimeScale(lead)).toBe(1);
    }
  });

  it("is strictly increasing beyond the leash until the cap", () => {
    const capLead = HAZARD_LEASH_M + (HAZARD_CATCHUP_MAX_SCALE - 1) * HAZARD_LEASH_RANGE_M;
    let prev = hazardCatchupTimeScale(HAZARD_LEASH_M + 0.01);
    expect(prev).toBeGreaterThan(1);
    let checked = 0;
    for (let lead = HAZARD_LEASH_M + 1; lead < capLead; lead += 1) {
      const s = hazardCatchupTimeScale(lead);
      expect(s).toBeGreaterThan(prev);
      prev = s;
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("is continuous at the leash boundary (no binary kick)", () => {
    expect(hazardCatchupTimeScale(HAZARD_LEASH_M + 1e-3)).toBeCloseTo(1, 4);
    expect(hazardCatchupTimeScale(HAZARD_LEASH_M + 1)).toBeLessThan(1.05);
  });

  it("gains one extra 1× per leash range", () => {
    expect(hazardCatchupTimeScale(HAZARD_LEASH_M + HAZARD_LEASH_RANGE_M)).toBeCloseTo(2, 9);
  });

  it("is capped at HAZARD_CATCHUP_MAX_SCALE however far ahead the climber is", () => {
    for (const lead of [500, 5_000, 1e9, Number.POSITIVE_INFINITY]) {
      expect(hazardCatchupTimeScale(lead)).toBe(HAZARD_CATCHUP_MAX_SCALE);
    }
  });

  it("reads a non-finite lead as within the leash (never NaN)", () => {
    expect(hazardCatchupTimeScale(Number.NaN)).toBe(1);
    expect(hazardCatchupTimeScale(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("is deterministic: the same lead gives the same scale", () => {
    for (const lead of [0, 50.5, 73.25, 130, 400]) {
      expect(hazardCatchupTimeScale(lead)).toBe(hazardCatchupTimeScale(lead));
    }
  });
});

describe("late creep (R2-2): envelope ramp → creep → cap", () => {
  /** Hazard-time seconds at the end of the ramp (grace included). */
  const RAMP_END = CFG.graceSeconds + CFG.rampSeconds;

  /** First surge-phase time at or after `from` (so no stumble multiplier). */
  function surgeAt(from: number): number {
    for (let t = from; t < from + CFG.stumblePeriodSeconds; t += 0.05) {
      if (hazardPhase(t, CFG).phase === "surge") return t;
    }
    throw new Error(`no surge within one cycle of ${from}`);
  }

  /** The spec's rate, as a literal: a symbolic CFG read passes with creep off. */
  const SPEC_CREEP_PER_MIN = 0.02;

  it("keeps rising 0.02 per minute after the ramp", () => {
    let checked = 0;
    for (const at of [RAMP_END + 1, RAMP_END + 60, RAMP_END + 150, RAMP_END + 240]) {
      const t = surgeAt(at);
      const minutes = (t - RAMP_END) / 60;
      expect(hazardSpeedFracAt(t, CFG)).toBeCloseTo(
        CFG.endSpeedFrac + SPEC_CREEP_PER_MIN * minutes,
        9
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("reaches the 1× cap about 6.5 minutes in, then holds there", () => {
    expect(CFG.creepPerMinute).toBe(SPEC_CREEP_PER_MIN);
    expect(hazardSpeedFracAt(surgeAt(380), CFG)).toBeLessThan(1);
    const late = [surgeAt(400), surgeAt(900), surgeAt(3600)];
    for (const t of late) expect(hazardSpeedFracAt(t, CFG)).toBe(1);
  });

  it("with creep 0 the envelope holds at endSpeedFrac forever", () => {
    const flat = { ...CFG, creepPerMinute: 0 };
    expect(hazardSpeedFracAt(surgeAt(3600), flat)).toBe(CFG.endSpeedFrac);
    expect(hazardMeanSpeedFrac(flat, Infinity)).toBe(hazardMeanSpeedFrac(flat));
  });

  it("with rampSeconds 0 the default mean is the end-of-ramp mean, not the start", () => {
    // The shipped tune's end-of-ramp mean is 0.702; the start envelope's is 0.324.
    for (const creepPerMinute of [0, SPEC_CREEP_PER_MIN]) {
      const noRamp = { ...CFG, rampSeconds: 0, creepPerMinute };
      expect(hazardMeanSpeedFrac(noRamp), `creep ${creepPerMinute}`).toBeCloseTo(0.702, 3);
      expect(hazardMeanSpeedFrac(noRamp), `creep ${creepPerMinute}`).toBeCloseTo(
        hazardMeanSpeedFrac(CFG),
        9
      );
    }
  });

  // Captured from hazard.ts at d6f2429, the last commit before creep existed
  // (hazardHeightAt at 9 m/s and hazardSpeedFracAt, the tune then: a 16 s
  // cycle with a 6 s stumble). creep 0 must reproduce the old curve bit for
  // bit on that cycle, or the creep code path changed the integral.
  const OLD_CYCLE = { stumblePeriodSeconds: 16, stumbleDurationSeconds: 6 };
  const OLD_HEIGHT: ReadonlyArray<readonly [number, number]> = [
    [0, -9], [4.99, -9], [5, -9], [5.5, -7.10540625],
    [17.25, 32.522479687499995], [60, 184.70557499999998],
    [124.999, 506.8610100183748], [125, 506.86919999999986],
    [125.001, 506.87739], [133.3, 535.5342], [200, 924.5591999999998],
    [400, 2084.2632000000003], [600, 3217.7592000000013],
    [1000, 5510.959200000003], [3600, 20429.863200000054],
  ];
  const OLD_FRAC: ReadonlyArray<readonly [number, number]> = [
    [5.5, 0.42204166666666665], [17.25, 0.09400416666666667],
    [60, 0.6445833333333333], [124.999, 0.9099959166666667], [125, 0.91],
    [200, 0.91], [400, 0.18200000000000002], [3600, 0.18200000000000002],
  ];

  it("creep 0 equals the pre-creep curve exactly", () => {
    const flat = { ...CFG, ...OLD_CYCLE, creepPerMinute: 0 };
    for (const [t, h] of OLD_HEIGHT) expect(hazardHeightAt(t, CLIMB, flat), `t=${t}`).toBe(h);
    for (const [t, f] of OLD_FRAC) expect(hazardSpeedFracAt(t, flat), `t=${t}`).toBe(f);
  });

  it("creep 0 equals the pre-creep curve exactly with no stumble and over the cap", () => {
    // Also captured at d6f2429: the smooth branch, and endSpeedFrac > 1
    // (clamped to the cap) with a non-unit speedScale.
    const smooth = { ...CFG, creepPerMinute: 0, stumblePeriodSeconds: 0, stumbleDurationSeconds: 0 };
    const hot = { ...CFG, ...OLD_CYCLE, creepPerMinute: 0, endSpeedFrac: 1.3, speedScale: 1.5 };
    const smoothOld: ReadonlyArray<readonly [number, number]> = [
      [5.5, -7.315916666666666], [60, 225.20833333333331], [125, 629.4],
      [133.3, 689.8240000000001], [600, 4087.3999999999996],
    ];
    const hotOld: ReadonlyArray<readonly [number, number]> = [
      [5.5, -5.8409375], [60, 326.16025], [125, 908.7240000000002],
      [133.3, 961.2240000000004], [600, 5873.724],
    ];
    for (const [t, h] of smoothOld) expect(hazardHeightAt(t, 8, smooth), `smooth t=${t}`).toBe(h);
    for (const [t, h] of hotOld) expect(hazardHeightAt(t, 10, hot), `hot t=${t}`).toBe(h);
  });

  it("the creep changes nothing before the ramp ends and raises the lava after", () => {
    const flat = { ...CFG, creepPerMinute: 0 };
    for (const t of [0, 5.5, 60, RAMP_END]) {
      expect(hazardHeightAt(t, CLIMB, CFG)).toBe(hazardHeightAt(t, CLIMB, flat));
    }
    expect(hazardHeightAt(RAMP_END + 60, CLIMB, CFG)).toBeGreaterThan(
      hazardHeightAt(RAMP_END + 60, CLIMB, flat)
    );
  });

  it("a negative or non-finite creep never lowers the lava (reads as 0)", () => {
    const flat = { ...CFG, creepPerMinute: 0 };
    for (const creepPerMinute of [-0.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const hostile = { ...CFG, creepPerMinute };
      for (const t of [60, 300, 900]) {
        expect(hazardHeightAt(t, CLIMB, hostile)).toBe(hazardHeightAt(t, CLIMB, flat));
      }
    }
  });

  it("the closed form matches a fine numerical integral across ramp, creep and cap boundaries", () => {
    // Odd tune so every boundary (ramp end 39.4 s, cap ~46.46 s, stumble
    // edges every 7.3 s) lands at an arbitrary time, mid-surge or mid-stumble.
    const odd = {
      ...CFG,
      headStartM: 4,
      graceSeconds: 2.1,
      startSpeedFrac: 0.3,
      endSpeedFrac: 0.8,
      rampSeconds: 37.3,
      creepPerMinute: 1.7,
      stumblePeriodSeconds: 7.3,
      stumbleDurationSeconds: 2.9,
      stumbleSpeedFrac: 0.35,
      speedScale: 1.3,
    };
    const climb = 9;
    const vScale = climb * odd.speedScale;
    // Sanity: the fixture really crosses all three envelope pieces.
    expect(hazardSpeedFracAt(20, odd)).toBeLessThan(odd.endSpeedFrac);
    expect(hazardMeanSpeedFrac(odd, 43)).toBeGreaterThan(hazardMeanSpeedFrac(odd));
    expect(hazardMeanSpeedFrac(odd, 43)).toBeLessThan(hazardMeanSpeedFrac(odd, Infinity));

    const dt = 1e-4;
    const checkpoints = [20.7713, 39.3999, 39.4003, 43.1234, 46.4581, 46.4596, 51.9, 88.8];
    const idx = new Set(checkpoints.map((t) => Math.round(t / dt)));
    const last = Math.max(...idx);
    let area = 0;
    let checked = 0;
    for (let i = 1; i <= last; i++) {
      area += hazardSpeedFracAt((i - 0.5) * dt, odd) * dt; // midpoint rule
      if (!idx.has(i)) continue;
      const t = i * dt;
      expect(hazardHeightAt(t, climb, odd), `t=${t}`).toBeCloseTo(
        area * vScale - odd.headStartM,
        // < 5e-7 m. The midpoint rule is exact on each linear piece; the
        // stumble edges sit on the 1e-4 grid and the cap is only a kink, so
        // the measured error is ~2e-9 m.
        6
      );
      checked += 1;
    }
    expect(checked).toBe(checkpoints.length);
  });

  it("the shipped tune's closed form matches a numerical integral through the ramp end and the cap", () => {
    // The default curve players get: ramp ends at 125 s, the creep reaches
    // the cap at 395 s. Its stumble edges, ramp end and cap all sit on the
    // 1 ms grid, so the midpoint rule is exact up to float summation.
    const capAtS = RAMP_END + ((1 - CFG.endSpeedFrac) / CFG.creepPerMinute) * 60;
    expect(capAtS).toBeCloseTo(395, 9);
    const dt = 1e-3;
    const checkpoints = [60.5, 124.9, 125.4, 300.2, 394.6, 395.3, 450];
    const idx = new Set(checkpoints.map((t) => Math.round(t / dt)));
    const last = Math.max(...idx);
    let area = 0;
    let checked = 0;
    for (let i = 1; i <= last; i++) {
      area += hazardSpeedFracAt((i - 0.5) * dt, CFG) * dt;
      if (!idx.has(i)) continue;
      const t = i * dt;
      // < 5e-5 m on heights up to ~2.5 km (float summation over 450k steps).
      expect(hazardHeightAt(t, CLIMB, CFG), `t=${t}`).toBeCloseTo(
        area * CLIMB - CFG.headStartM,
        4
      );
      checked += 1;
    }
    expect(checked).toBe(checkpoints.length);
  });
});
