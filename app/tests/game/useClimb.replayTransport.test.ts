/**
 * Replay transport surface on useClimb — pure predicate + speed helpers.
 * Full rAF pause/speed timing is browser-level; these lock the gated API
 * contracts that do not require mounting React.
 */

import { describe, it, expect } from "vitest";
import { shouldCaptureGameKey } from "../../src/game/useClimb";
import {
  cycleReplaySpeed,
  shouldCaptureReplayKey,
} from "../../src/game/replayTransport";

describe("live vs replay key predicates", () => {
  it("live Space still captures during climb when canvas owns focus (AC-20)", () => {
    expect(shouldCaptureGameKey(" ", "climb", false)).toBe(true);
  });

  it("live predicate is false while replaying so Space/arrows are not swallowed", () => {
    expect(shouldCaptureGameKey(" ", "climb", false, true)).toBe(false);
    expect(shouldCaptureGameKey("ArrowLeft", "climb", false, true)).toBe(false);
    expect(shouldCaptureGameKey("ArrowUp", "climb", false, true)).toBe(false);
  });

  it("replay predicate is false when not replaying so live path is unchanged", () => {
    expect(shouldCaptureReplayKey(" ", false, false)).toBe(false);
    expect(shouldCaptureReplayKey("j", false, false)).toBe(false);
  });

  it("both predicates exempt interactive targets", () => {
    expect(shouldCaptureGameKey(" ", "climb", true)).toBe(false);
    expect(shouldCaptureReplayKey(" ", true, true)).toBe(false);
  });
});

describe("speed while paused semantics (AC-9 helper)", () => {
  it("cycling speed does not require play — pure cycle is independent of pause", () => {
    let speed = cycleReplaySpeed(1);
    expect(speed).toBe(2);
    speed = cycleReplaySpeed(speed);
    expect(speed).toBe(4);
    speed = cycleReplaySpeed(speed);
    expect(speed).toBe(1);
  });
});
