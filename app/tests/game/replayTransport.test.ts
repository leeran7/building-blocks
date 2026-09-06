/**
 * Replay transport pure helpers — invoke production units (no source greps).
 */

import { describe, it, expect } from "vitest";
import {
  REWIND_STEP_TICKS,
  REPLAY_SPEEDS,
  SNAPSHOT_INTERVAL_TICKS,
  cycleReplaySpeed,
  rewindTargetTick,
  tickFromSeekRatio,
  commitScrubRatio,
  formatReplayClock,
  shouldCaptureReplayKey,
  nextSpeed,
  rewindTick,
  seekTickFromRatio,
} from "../../src/game/replayTransport";

describe("replayTransport constants", () => {
  it("locks normative rewind, speeds, and snapshot interval", () => {
    expect(REWIND_STEP_TICKS).toBe(150);
    expect([...REPLAY_SPEEDS]).toEqual([1, 2, 4]);
    expect(SNAPSHOT_INTERVAL_TICKS).toBe(120);
  });
});

describe("cycleReplaySpeed", () => {
  it("cycles 1 → 2 → 4 → 1", () => {
    expect(cycleReplaySpeed(1)).toBe(2);
    expect(cycleReplaySpeed(2)).toBe(4);
    expect(cycleReplaySpeed(4)).toBe(1);
    expect(nextSpeed(1)).toBe(2);
  });
});

describe("rewindTargetTick", () => {
  it("rewinds by 150 and floors at 0", () => {
    expect(rewindTargetTick(400)).toBe(250);
    expect(rewindTargetTick(150)).toBe(0);
    expect(rewindTargetTick(0)).toBe(0);
    expect(rewindTick(10)).toBe(0);
  });
});

describe("tickFromSeekRatio", () => {
  it("maps r∈{0,0.5,1} per AC-7", () => {
    const n = 101;
    expect(tickFromSeekRatio(0, n)).toBe(0);
    expect(tickFromSeekRatio(0.5, n)).toBe(50);
    expect(tickFromSeekRatio(1, n)).toBe(100);
    expect(seekTickFromRatio(1, 2)).toBe(1);
  });

  it("seeking to 0 with N≥1 yields tick 0", () => {
    expect(tickFromSeekRatio(0, 1)).toBe(0);
    expect(tickFromSeekRatio(0, 50)).toBe(0);
  });
});

describe("commitScrubRatio", () => {
  it("commits a mid-drag ratio to a tick ≠ live climbTick (AC-7 scrub)", () => {
    const totalTicks = 301;
    const liveClimbTick = 30; // playing near the start
    const midDragRatio = 0.75;
    const committed = commitScrubRatio(midDragRatio, totalTicks);
    expect(committed).toBe(tickFromSeekRatio(midDragRatio, totalTicks));
    expect(committed).toBe(225);
    expect(committed).not.toBe(liveClimbTick);
  });

  it("does not snap back to the pre-drag tick when ratio moved", () => {
    const totalTicks = 101;
    const preDragTick = 10;
    const preDragRatio = preDragTick / (totalTicks - 1);
    const scrubbedRatio = 0.9;
    expect(commitScrubRatio(scrubbedRatio, totalTicks)).not.toBe(
      commitScrubRatio(preDragRatio, totalTicks)
    );
    expect(commitScrubRatio(scrubbedRatio, totalTicks)).toBe(90);
  });
});

describe("formatReplayClock", () => {
  it("formats mm:ss from tick/30", () => {
    expect(formatReplayClock(0)).toBe("00:00");
    expect(formatReplayClock(30)).toBe("00:01");
    expect(formatReplayClock(90)).toBe("00:03");
    expect(formatReplayClock(1800)).toBe("01:00");
  });
});

describe("shouldCaptureReplayKey", () => {
  it("captures transport keys only while replaying and non-interactive", () => {
    expect(shouldCaptureReplayKey(" ", true, false)).toBe(true);
    expect(shouldCaptureReplayKey("k", true, false)).toBe(true);
    expect(shouldCaptureReplayKey("j", true, false)).toBe(true);
    expect(shouldCaptureReplayKey("l", true, false)).toBe(true);
    expect(shouldCaptureReplayKey(".", true, false)).toBe(true);
    expect(shouldCaptureReplayKey("Home", true, false)).toBe(true);
    expect(shouldCaptureReplayKey("0", true, false)).toBe(true);
  });

  it("never captures when not replaying (AC-20)", () => {
    expect(shouldCaptureReplayKey(" ", false, false)).toBe(false);
    expect(shouldCaptureReplayKey("j", false, false)).toBe(false);
  });

  it("never captures when focus is interactive (AC-3 negative)", () => {
    expect(shouldCaptureReplayKey(" ", true, true)).toBe(false);
    expect(shouldCaptureReplayKey("k", true, true)).toBe(false);
    expect(shouldCaptureReplayKey("j", true, true)).toBe(false);
  });

  it("ignores unbound keys", () => {
    expect(shouldCaptureReplayKey("Escape", true, false)).toBe(false);
    expect(shouldCaptureReplayKey("ArrowLeft", true, false)).toBe(false);
  });
});
