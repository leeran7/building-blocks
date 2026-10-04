import { useCallback, useState } from "react";

/**
 * Guest mode ("Continue as Guest"), kept on the device across launches until
 * the guest taps Sign In. Plus the guest's Endless run count, which shows a
 * one-time sign-in nudge after the third run. Every read and write survives
 * storage refusing it (private mode): guest mode then lasts this launch only.
 */

export const GUEST_MODE_KEY = "doomstack:guest";
export const GUEST_RUNS_KEY = "doomstack:guest:endless-runs";
export const GUEST_NUDGE_KEY = "doomstack:guest:nudge-shown";
/** The finished guest Endless run that brings the sign-in nudge. */
export const GUEST_NUDGE_AFTER_RUNS = 3;

export function readGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuestMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(GUEST_MODE_KEY, "1");
    else localStorage.removeItem(GUEST_MODE_KEY);
  } catch {
    /* storage unavailable: guest mode lasts this launch */
  }
}

/** Guest mode and the two ways in and out of it. */
export function useGuestMode(): { guestMode: boolean; enterGuest: () => void; exitGuest: () => void } {
  const [guestMode, setGuestMode] = useState(readGuestMode);
  const enterGuest = useCallback(() => {
    setGuestMode(true);
    writeGuestMode(true);
  }, []);
  const exitGuest = useCallback(() => {
    setGuestMode(false);
    writeGuestMode(false);
  }, []);
  return { guestMode, enterGuest, exitGuest };
}

/** Run nudge shown this launch, for when storage refuses the write: never twice. */
let nudgeShownThisLaunch = false;
/** Runs counted this launch, for when storage refuses the write. */
let runsThisLaunch = 0;

function readCount(): number {
  try {
    const n = Number(localStorage.getItem(GUEST_RUNS_KEY));
    return Math.max(runsThisLaunch, Number.isInteger(n) && n > 0 ? n : 0);
  } catch {
    return runsThisLaunch;
  }
}

function nudgeShown(): boolean {
  if (nudgeShownThisLaunch) return true;
  try {
    return localStorage.getItem(GUEST_NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Count one finished guest Endless run. True exactly once per device: on the
 * run that reaches GUEST_NUDGE_AFTER_RUNS (or the first run after it, when an
 * earlier nudge never got shown), which marks the nudge shown.
 */
export function recordGuestEndlessRun(): boolean {
  const count = readCount() + 1;
  runsThisLaunch = count;
  try {
    localStorage.setItem(GUEST_RUNS_KEY, String(count));
  } catch {
    /* storage unavailable: the count restarts next launch */
  }
  if (count < GUEST_NUDGE_AFTER_RUNS || nudgeShown()) return false;
  nudgeShownThisLaunch = true;
  try {
    localStorage.setItem(GUEST_NUDGE_KEY, "1");
  } catch {
    /* remembered for this launch only */
  }
  return true;
}

/** Tests only: forget the in-memory flag along with storage. */
export function resetGuestNudgeForTests(): void {
  nudgeShownThisLaunch = false;
  runsThisLaunch = 0;
}
