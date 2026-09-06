/**
 * AC-18 visibility policy for MediaRecorder export.
 * Pausing the encode step loop is not enough — captureStream keeps emitting
 * frozen frames unless the recorder itself is paused.
 */

export const EXPORT_HIDDEN_PAUSE_MS = 3000;

/** Minimal recorder surface for pause/resume (injectable in tests). */
export type PauseableRecorder = {
  state: string;
  pause?: () => void;
  resume?: () => void;
};

/**
 * Pause MediaRecorder when entering paused_hidden.
 * Returns false when pause is required but unsupported (AC-19 fail-closed).
 */
export function pauseExportRecorder(recorder: PauseableRecorder): boolean {
  if (recorder.state !== "recording") return true;
  if (typeof recorder.pause !== "function") return false;
  try {
    recorder.pause();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resume MediaRecorder when the tab becomes visible again.
 * Returns false when resume is required but unsupported (AC-19 fail-closed).
 */
export function resumeExportRecorder(recorder: PauseableRecorder): boolean {
  if (recorder.state !== "paused") return true;
  if (typeof recorder.resume !== "function") return false;
  try {
    recorder.resume();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether hidden wall-clock time has crossed the AC-18 pause threshold.
 */
export function shouldEnterPausedHidden(
  hiddenSince: number | null,
  now: number,
  thresholdMs: number = EXPORT_HIDDEN_PAUSE_MS
): boolean {
  if (hiddenSince === null) return false;
  return now - hiddenSince >= thresholdMs;
}
