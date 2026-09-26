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
 * What this pins (spec-lava-apparency, "Tests"):
 *   - the leash holds: pace 0.7–1.0 keeps the gap in [40, 115] ft after 30 s,
 *     so the lava neither runs away (the old 250 ft binary kick) nor catches;
 *   - the beginner floor: pace 0.5 is caught above 550 ft;
 *   - the run still ends: pace 0.45 is caught;
 *   - a mistake has a window: stalls at pace 0.85.
 */

import { describe, expect, it } from "vitest";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../src/game/simulation";
import { buildFreeTower } from "../../src/game/freeStack";
import { hazardPhase, DEFAULT_HAZARD_CONFIG } from "../../src/game/hazard";
import { TICK_DT, TICK_HZ, type MatchState } from "../../src/game/types";

/** A slot no player occupies: stepMatch integrates nobody. */
const GHOST_SLOT = 99;
/** Gap band (ft) the leash must hold a 0.7–1.0 pace climber inside. */
const BAND_LO = 40;
const BAND_HI = 115;
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

function runAtPace(pace: Pace, seconds: number = RUN_S): RunResult {
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
    stepMatch(m, {}, DEFAULT_SIM_CONFIG, { localSlot: GHOST_SLOT });
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
  for (const pace of [0.7, 0.85, 1.0]) {
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
  it("beginner floor: a 0.5× climber is caught, but only above 550 ft", () => {
    const r = runAtPace(constant(0.5));
    expect(r.caught).toBe(true);
    expect(r.peakY).toBeGreaterThan(550);
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
