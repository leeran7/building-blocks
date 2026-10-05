/**
 * Leash equilibrium — drives the REAL stepMatch, not a model of it.
 *
 * The climber is ghost-slaved: `opts.localSlot` names a slot no player has, so
 * stepMatch counts the climber in the hazard (the leash reads their lead) but
 * does not integrate them. The test moves them at a constant fraction of the
 * ladder climb speed each tick and applies the sim's own lethal condition
 * (feet at or below the lava line) — the same thing a duel client does with a
 * peer's ghost snapshot.
 *
 * What this pins (spec-lava-apparency, "Tests" and Revision 2):
 *   - the leash holds: burst paces 0.75–1.0 keep the gap in [35, 115] ft
 *     after 30 s, so the lava neither runs away (the old 250 ft binary kick)
 *     nor catches;
 *   - the beginner floor: pace 0.5 is caught above 500 ft;
 *   - the run still ends: pace 0.45 is caught;
 *   - a mistake has a window: stalls at pace 0.85;
 *   - late creep (R2-2): beginners are untouched, 0.68 is caught sooner, and
 *     0.72 (above every unaided pace and the end-of-ramp mean) is caught
 *     within about 6 minutes.
 */

import { describe, expect, it } from "vitest";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import type { SimConfig } from "../../src/game/simulation";
import { buildFreeTower } from "../../src/game/freeStack";
import {
  hazardMeanSpeedFrac,
  hazardPhase,
  DEFAULT_HAZARD_CONFIG,
} from "../../src/game/hazard";
import { TICK_DT, TICK_HZ, type MatchState } from "../../src/game/types";

/** A slot no player occupies: stepMatch integrates nobody. */
const GHOST_SLOT = 99;
/**
 * Gap band (ft) the leash must hold a burst-pace climber inside.
 *
 * BAND_HI (115) is unchanged: the widest gap is set early in the ramp
 * (1.0× peaks at ~103 ft near 30 s; ~111 ft with the old 6 s stumble),
 * before the creep starts at 125 s.
 *
 * BAND_LO moved 40 → 35 with the late creep (R2-2), for a measured reason:
 * the creep lifts the surge speed from 0.91× to 1× by ~395 s, so each late
 * surge closes a few ft more before the stumble opens the gap again. Over
 * the 300 s match: 0.80× dips to 40.9 ft, 0.85× to 45.5, 1.0× to 53.7
 * (with the 4 s stumble; 0.85× was 47.9 and 1.0× 56.1 with the 6 s one). 35 still sits well above the HUD danger
 * band (24 ft), so the assertion keeps its meaning: the lava rides behind a
 * burst-pace climber and never reaches them.
 */
const BAND_LO = 35;
const BAND_HI = 115;
/**
 * Paces held in the band. 0.70, then 0.75, used to be here; with the 4 s
 * stumble the late mean (hazardMeanSpeedFrac at the cap) is 0.77, so a 0.75
 * climber is below the kill threshold: measured, its gap dips to 32 ft inside
 * the 300 s match and it is caught at ~489 s. 0.80 (gap ≥ 40.9 ft) is the
 * slowest burst pace clearly above it.
 */
const BAND_PACES = [0.8, 0.85, 1.0];
/** Band is measured after the opening, once the envelope and leash settle. */
const SETTLE_S = 30;
const RUN_S = 300;
const STALL_PACE = 0.85;
/** Stalls start after the ramp is well underway. */
const STALL_AFTER_S = 60;

type Pace = (m: MatchState) => number;

interface RunResult {
  caught: boolean;
  caughtAtS: number | null;
  peakY: number;
  minGap: number;
  maxGap: number;
  /** Ticks that contributed to minGap / maxGap (guards the band loop). */
  bandTicks: number;
}

/** Default tune with the late creep switched off (the pre-R2-2 curve). */
const NO_CREEP: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  hazard: { ...DEFAULT_HAZARD_CONFIG, creepPerMinute: 0 },
};

function runAtPace(
  pace: Pace,
  seconds: number = RUN_S,
  cfg: SimConfig = DEFAULT_SIM_CONFIG
): RunResult {
  const tower = buildFreeTower();
  const m = createMatch({ seed: "leash", mode: "solo", tower, playerIds: ["ghost"] });
  m.phase = "climb";
  m.tick = 0;
  const p = m.players[0];
  let minGap = Infinity;
  let maxGap = -Infinity;
  let bandTicks = 0;
  let caughtAtS: number | null = null;
  const maxTicks = Math.round(seconds * TICK_HZ);
  for (let i = 0; i < maxTicks && m.phase === "climb"; i++) {
    p.y += pace(m) * tower.maxClimbSpeed * TICK_DT;
    if (p.y > p.peakY) p.peakY = p.y;
    stepMatch(m, {}, cfg, { localSlot: GHOST_SLOT });
    if (p.status !== "climbing") break;
    if (p.y <= m.hazardY) {
      p.status = "eliminated";
      p.finishedTick = m.tick;
      caughtAtS = m.raceSeconds;
      break;
    }
    if (m.raceSeconds < SETTLE_S) continue;
    const gap = p.y - m.hazardY;
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
    bandTicks += 1;
  }
  return { caught: caughtAtS !== null, caughtAtS, peakY: p.peakY, minGap, maxGap, bandTicks };
}

const constant = (pace: number): Pace => () => pace;

/** Effective hazard phase the sim is in right now (same call the HUD makes). */
function phaseOf(m: MatchState) {
  return hazardPhase(m.raceSeconds - m.hazardSlowSeconds, DEFAULT_HAZARD_CONFIG).phase;
}

/**
 * Pace 0.85, then stand still for `stallS` seconds starting at `startS`
 * (or, when `startS` is "stumble", at the first stumble after STALL_AFTER_S).
 */
function stallPace(stallS: number, startS: number | "stumble"): {
  pace: Pace;
  stallStartS: () => number | null;
} {
  let start: number | null = typeof startS === "number" ? startS : null;
  let prevPhase: string | null = null;
  return {
    stallStartS: () => start,
    pace: (m) => {
      const t = m.raceSeconds;
      if (start === null) {
        const ph = phaseOf(m);
        if (t >= STALL_AFTER_S && prevPhase === "surge" && ph === "stumble") start = t;
        prevPhase = ph;
      }
      return start !== null && t >= start && t < start + stallS ? 0 : STALL_PACE;
    },
  };
}

describe("leash: the lava rides a fixed distance behind a fast climber", () => {
  it("every band pace is above the late (capped) kill threshold", () => {
    const lateMean = hazardMeanSpeedFrac(DEFAULT_HAZARD_CONFIG, Infinity);
    for (const pace of BAND_PACES) expect(pace).toBeGreaterThan(lateMean);
  });

  for (const pace of BAND_PACES) {
    it(`holds a ${pace}× climber between ${BAND_LO} and ${BAND_HI} ft for the whole match`, () => {
      const r = runAtPace(constant(pace));
      expect(r.caught).toBe(false);
      expect(r.bandTicks).toBeGreaterThan(0);
      expect(r.minGap).toBeGreaterThanOrEqual(BAND_LO);
      expect(r.maxGap).toBeLessThanOrEqual(BAND_HI);
    });
  }
});

describe("curve: the kill threshold still ends slow runs", () => {
  it("beginner floor: a 0.5× climber is caught, but only above 500 ft", () => {
    // Measured 523 ft with the 4 s stumble (580 ft with the old 6 s one).
    const r = runAtPace(constant(0.5));
    expect(r.caught).toBe(true);
    expect(r.peakY).toBeGreaterThan(500);
  });

  it("the run still ends: a 0.45× climber is caught", () => {
    const r = runAtPace(constant(0.45));
    expect(r.caught).toBe(true);
  });
});

describe("stalls at 0.85×: a mistake has a window, standing still does not", () => {
  it("a 10 s stall that starts as the lava stumbles is survivable", () => {
    const s = stallPace(10, "stumble");
    const r = runAtPace(s.pace, 150);
    expect(s.stallStartS()).not.toBeNull();
    expect(r.caught).toBe(false);
  });

  it("an 8 s stall is survivable whichever phase it lands in", () => {
    let checked = 0;
    const period = DEFAULT_HAZARD_CONFIG.stumblePeriodSeconds;
    for (let start = STALL_AFTER_S; start < STALL_AFTER_S + period; start += 1) {
      const r = runAtPace(stallPace(8, start).pace, 150);
      expect(r.caught, `8 s stall starting at ${start}s`).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a 20 s stall is fatal whichever phase it lands in", () => {
    let checked = 0;
    const period = DEFAULT_HAZARD_CONFIG.stumblePeriodSeconds;
    for (let start = STALL_AFTER_S; start < STALL_AFTER_S + period; start += 1) {
      const r = runAtPace(stallPace(20, start).pace, 150);
      expect(r.caught, `20 s stall starting at ${start}s`).toBe(true);
      expect(r.caughtAtS).toBeGreaterThan(start);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("late creep (R2-2) through the real stepMatch", () => {
  /** Minutes the 0.72× climber must be caught within (measured: 330 s). */
  const CREEP_CATCH_S = 6 * 60;
  /** "Within a few ft": beginner reach barely moves (measured ≤ 1.8 ft). */
  const BEGINNER_TOLERANCE_FT = 5;

  for (const pace of [0.45, 0.5, 0.55]) {
    it(`leaves a ${pace}× beginner within a few ft of the no-creep reach`, () => {
      const creep = runAtPace(constant(pace), 600);
      const flat = runAtPace(constant(pace), 600, NO_CREEP);
      expect(creep.caught).toBe(true);
      expect(flat.caught).toBe(true);
      expect(Math.abs(creep.peakY - flat.peakY)).toBeLessThanOrEqual(BEGINNER_TOLERANCE_FT);
    });
  }

  it("catches a 0.68× climber sooner than the curve without creep", () => {
    const creep = runAtPace(constant(0.68), 600);
    const flat = runAtPace(constant(0.68), 600, NO_CREEP);
    expect(creep.caughtAtS).not.toBeNull();
    expect(flat.caughtAtS).not.toBeNull();
    // Measured 211 s vs 294 s; a full minute sooner is the documented effect.
    expect(creep.caughtAtS as number).toBeLessThan((flat.caughtAtS as number) - 60);
  });

  it("catches a 0.72× climber, above every unaided pace, within about 6 minutes", () => {
    const creep = runAtPace(constant(0.72), CREEP_CATCH_S);
    expect(creep.caught).toBe(true);
    // Positive control: without creep the same climber is never caught.
    const flat = runAtPace(constant(0.72), 600, NO_CREEP);
    expect(flat.caught).toBe(false);
  });
});
