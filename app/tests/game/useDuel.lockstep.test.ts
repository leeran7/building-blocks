/**
 * Regression guard for the delay-based lockstep publish schedule (useDuel).
 *
 * The bug: the sim resets its tick counter to 0 at the countdown→climb boundary,
 * but the countdown used to publish inputs tagged with the COUNTDOWN tick
 * (`currentTick + INPUT_DELAY`). So climb tick tags 0..INPUT_DELAY-1 were never
 * published by anyone, the climb-tick-0 lockstep gate never opened, and the
 * match stalled ("syncing…") the instant the race started.
 *
 * These tests pin the invariant that keeps that from coming back: across the
 * whole countdown+climb run, every climb tick >= 0 is published EXACTLY ONCE —
 * no gap at the start, no duplicate at the seam.
 */

import { describe, it, expect } from "vitest";
import { publishTickFor, INPUT_DELAY } from "../../src/game/useDuel";
import { COUNTDOWN_TICKS } from "../../src/game/simulation";

/** Collect every tag a client would publish over a full countdown+climb run. */
function tagsForRun(climbTicks: number): number[] {
  const tags: number[] = [];
  for (let c = 0; c < COUNTDOWN_TICKS; c++) {
    const tag = publishTickFor("countdown", c);
    if (tag !== null) tags.push(tag);
  }
  for (let t = 0; t < climbTicks; t++) {
    const tag = publishTickFor("climb", t);
    if (tag !== null) tags.push(tag);
  }
  return tags;
}

describe("useDuel lockstep publish schedule", () => {
  it("has INPUT_DELAY strictly less than the countdown so ticks 0..INPUT_DELAY-1 fit", () => {
    // The pre-fill only works if the countdown is long enough to emit tags
    // 0..INPUT_DELAY-1 before the climb begins.
    expect(INPUT_DELAY).toBeGreaterThan(0);
    expect(INPUT_DELAY).toBeLessThan(COUNTDOWN_TICKS);
  });

  it("pre-fills climb ticks 0..INPUT_DELAY-1 during the countdown", () => {
    // The last INPUT_DELAY countdown ticks map onto climb tags 0..INPUT_DELAY-1.
    const preFill: number[] = [];
    for (let c = 0; c < COUNTDOWN_TICKS; c++) {
      const tag = publishTickFor("countdown", c);
      if (tag !== null) preFill.push(tag);
    }
    expect(preFill).toEqual(
      Array.from({ length: INPUT_DELAY }, (_, i) => i)
    );
  });

  it("climb tick 0 IS covered (the exact bug: it used to be starved)", () => {
    const tags = tagsForRun(300);
    expect(tags).toContain(0);
  });

  it("covers every climb tick exactly once with no gap or duplicate", () => {
    const CLIMB_TICKS = 500;
    const tags = tagsForRun(CLIMB_TICKS).sort((a, b) => a - b);

    // Highest tag comes from the last climb tick.
    const maxTag = CLIMB_TICKS - 1 + INPUT_DELAY;

    // Contiguous 0..maxTag, each once — no gap (stall) and no duplicate (desync).
    expect(tags).toEqual(Array.from({ length: maxTag + 1 }, (_, i) => i));
  });

  it("skips negative tags during the early countdown (nothing published)", () => {
    // Countdown ticks before (COUNTDOWN_TICKS - INPUT_DELAY) map to negative
    // tags and must publish nothing.
    for (let c = 0; c < COUNTDOWN_TICKS - INPUT_DELAY; c++) {
      expect(publishTickFor("countdown", c)).toBeNull();
    }
    // The seam tick maps exactly to climb tag 0.
    expect(publishTickFor("countdown", COUNTDOWN_TICKS - INPUT_DELAY)).toBe(0);
  });
});
