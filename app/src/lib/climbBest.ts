/**
 * Device-local best height on the endless climb, so a run can call out
 * "New best!" the moment the player passes it. Display only: the server's
 * record is the real one, this just remembers what this device has seen.
 *
 * Like the daily store it is not account-scoped, so account deletion wipes it
 * (clearClimbBest).
 */

const KEY = "doomstack:climb-best";

/** The best peak recorded on this device, or 0. Rejects anything but a finite, non-negative number. */
export function readClimbBest(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Record a finished run. Returns the best before it, so the caller can tell whether it improved. */
export function commitClimbBest(peakY: number): number {
  const prev = readClimbBest();
  if (Number.isFinite(peakY) && peakY > prev) {
    try {
      localStorage.setItem(KEY, String(peakY));
    } catch {
      /* storage unavailable — the callout just won't fire next run */
    }
  }
  return prev;
}

export function clearClimbBest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
