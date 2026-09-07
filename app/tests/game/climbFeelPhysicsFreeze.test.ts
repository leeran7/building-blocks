/**
 * AC-15 physics freeze — import RAPID_CLIMB_MULT and score envelope exports.
 * Exact pre-pass literals; never prove via source-text grep.
 */

import { describe, expect, it } from "vitest";
import { RAPID_CLIMB_MULT, JETPACK_MAX_VY } from "../../src/game/powerups";
import {
  MAX_ASCENT_SPEED_MPS,
  MAX_RUN_TICKS,
} from "../../src/game/scoreBounds";
import { FASTEST_ARCHETYPE } from "../../src/game/towers";
import { TICK_HZ } from "../../src/game/types";

/** Pre-pass recorded baselines for Climb Feel 1.2× (AC-15). */
const PRE_PASS_RAPID_CLIMB_MULT = 1.75;
const PRE_PASS_MAX_RUN_TICKS = 6 * 60 * 60 * TICK_HZ;

describe("AC-15 physics / score envelope freeze", () => {
  it("RAPID_CLIMB_MULT equals the pre-pass value exactly", () => {
    expect(RAPID_CLIMB_MULT).toBe(PRE_PASS_RAPID_CLIMB_MULT);
  });

  it("MAX_ASCENT_SPEED_MPS equals the closed-form pre-pass envelope", () => {
    const expected = Math.max(
      FASTEST_ARCHETYPE.maxClimbSpeed * PRE_PASS_RAPID_CLIMB_MULT,
      FASTEST_ARCHETYPE.jumpSpeed,
      JETPACK_MAX_VY
    );
    expect(MAX_ASCENT_SPEED_MPS).toBe(expected);
  });

  it("MAX_RUN_TICKS remains the 6-hour persist-path cap", () => {
    expect(MAX_RUN_TICKS).toBe(PRE_PASS_MAX_RUN_TICKS);
  });
});
