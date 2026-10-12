/**
 * The portal's one piece of saved progress: the best height on this device
 * (or in the host's cloud save), through the target's PlatformAdapter.
 */

import type { PlatformAdapter } from "../targets/types";

export const BEST_HEIGHT_KEY = "doomstack:portal:best-height";

/** Allow-list parse of a saved value: a finite, non-negative number, else null. */
export function parseBest(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface RunSettlement {
  /** The best after this run. */
  best: number;
  /** The stored best should be rewritten (the run went higher). */
  improved: boolean;
  /**
   * Celebrate: the run beat an earlier best in whole feet, as shown. The very
   * first run on a device sets the best quietly: there is nothing to beat yet.
   */
  newBest: boolean;
}

/** What a finished run peaking at `peak` does to the best `prev` (null: none saved yet). */
export function settleRun(prev: number | null, peak: number): RunSettlement {
  const height = Number.isFinite(peak) && peak > 0 ? peak : 0;
  if (prev === null) return { best: height, improved: height > 0, newBest: false };
  const improved = height > prev;
  return {
    best: improved ? height : prev,
    improved,
    newBest: Math.round(height) > Math.round(prev),
  };
}

/** The saved best, or null when none is saved or the value is unusable. Never throws. */
export async function loadBest(platform: PlatformAdapter): Promise<number | null> {
  try {
    return parseBest(await platform.loadData(BEST_HEIGHT_KEY));
  } catch {
    return null;
  }
}

/**
 * Save `height` unless the store already holds more. Reading first means a
 * run that ended before the saved best had loaded can never overwrite it.
 */
export async function saveBest(platform: PlatformAdapter, height: number): Promise<void> {
  try {
    const stored = await loadBest(platform);
    if (stored !== null && stored >= height) return;
    await platform.saveData(BEST_HEIGHT_KEY, String(height));
  } catch {
    // The best is lost for this session; the game carries on.
  }
}
