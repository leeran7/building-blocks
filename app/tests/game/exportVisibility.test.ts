/**
 * AC-18 MediaRecorder pause/resume on tab hide — fake recorder, no source greps.
 */

import { describe, it, expect, vi } from "vitest";
import {
  EXPORT_HIDDEN_PAUSE_MS,
  pauseExportRecorder,
  resumeExportRecorder,
  shouldEnterPausedHidden,
  type PauseableRecorder,
} from "../../src/game/exportVisibility";

function fakeRecorder(
  initial: "recording" | "paused" | "inactive" = "recording"
): PauseableRecorder & {
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
} {
  const rec: PauseableRecorder & {
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  } = {
    state: initial,
    pause: vi.fn(function (this: PauseableRecorder) {
      this.state = "paused";
    }),
    resume: vi.fn(function (this: PauseableRecorder) {
      this.state = "recording";
    }),
  };
  return rec;
}

describe("shouldEnterPausedHidden", () => {
  it("enters paused_hidden only after hidden ≥3s", () => {
    const t0 = 1000;
    expect(shouldEnterPausedHidden(null, t0)).toBe(false);
    expect(shouldEnterPausedHidden(t0, t0 + 2999)).toBe(false);
    expect(shouldEnterPausedHidden(t0, t0 + EXPORT_HIDDEN_PAUSE_MS)).toBe(true);
    expect(shouldEnterPausedHidden(t0, t0 + 5000)).toBe(true);
  });
});

describe("pauseExportRecorder / resumeExportRecorder", () => {
  it("pauses MediaRecorder when hidden threshold is crossed", () => {
    const recorder = fakeRecorder("recording");
    const hiddenSince = 0;
    const now = EXPORT_HIDDEN_PAUSE_MS;
    expect(shouldEnterPausedHidden(hiddenSince, now)).toBe(true);
    expect(pauseExportRecorder(recorder)).toBe(true);
    expect(recorder.pause).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("paused");
  });

  it("resumes MediaRecorder when tab becomes visible again", () => {
    const recorder = fakeRecorder("paused");
    expect(resumeExportRecorder(recorder)).toBe(true);
    expect(recorder.resume).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("recording");
  });

  it("is a no-op when already paused / already recording", () => {
    const paused = fakeRecorder("paused");
    expect(pauseExportRecorder(paused)).toBe(true);
    expect(paused.pause).not.toHaveBeenCalled();

    const recording = fakeRecorder("recording");
    expect(resumeExportRecorder(recording)).toBe(true);
    expect(recording.resume).not.toHaveBeenCalled();
  });

  it("fails closed when pause/resume are missing (AC-19)", () => {
    const noPause: PauseableRecorder = { state: "recording" };
    expect(pauseExportRecorder(noPause)).toBe(false);

    const noResume: PauseableRecorder = { state: "paused" };
    expect(resumeExportRecorder(noResume)).toBe(false);
  });

  it("fails closed when pause/resume throw", () => {
    const badPause: PauseableRecorder = {
      state: "recording",
      pause: () => {
        throw new Error("not implemented");
      },
    };
    expect(pauseExportRecorder(badPause)).toBe(false);

    const badResume: PauseableRecorder = {
      state: "paused",
      resume: () => {
        throw new Error("not implemented");
      },
    };
    expect(resumeExportRecorder(badResume)).toBe(false);
  });
});
