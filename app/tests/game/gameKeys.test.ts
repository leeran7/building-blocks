/**
 * Game-key capture scoping.
 *
 * The window listener used to preventDefault every Space and arrow press on
 * the page, in every phase. That stopped the Start / Climb-again / mute
 * buttons from activating with Space and stopped arrow-key scrolling to the
 * how-to-play card. The listener is still global — these tests lock the
 * conditions under which it is allowed to consume a key.
 */

import { describe, it, expect } from "vitest";
import { shouldCaptureGameKey } from "../../src/game/useClimb";
import type { MatchPhase } from "../../src/game/types";

const PHASES: MatchPhase[] = [
  "lobby",
  "countdown",
  "climb",
  "finished",
  "results",
];

describe("shouldCaptureGameKey", () => {
  it("never captures in lobby or results, so Space can activate page buttons", () => {
    for (const phase of ["lobby", "finished", "results"] as MatchPhase[]) {
      expect(shouldCaptureGameKey(" ", phase, false)).toBe(false);
      expect(shouldCaptureGameKey("ArrowDown", phase, false)).toBe(false);
    }
  });

  it("captures Space and arrows during countdown and climb when the canvas owns focus", () => {
    for (const phase of ["countdown", "climb"] as MatchPhase[]) {
      expect(shouldCaptureGameKey(" ", phase, false)).toBe(true);
      expect(shouldCaptureGameKey("ArrowLeft", phase, false)).toBe(true);
      expect(shouldCaptureGameKey("w", phase, false)).toBe(true);
    }
  });

  it("does not capture when the focused control is interactive", () => {
    expect(shouldCaptureGameKey(" ", "climb", true)).toBe(false);
    expect(shouldCaptureGameKey("ArrowUp", "climb", true)).toBe(false);
  });

  it("ignores keys the game does not bind", () => {
    for (const phase of PHASES) {
      expect(shouldCaptureGameKey("Escape", phase, false)).toBe(false);
      expect(shouldCaptureGameKey("Tab", phase, false)).toBe(false);
      expect(shouldCaptureGameKey("m", phase, false)).toBe(false);
    }
  });
});
