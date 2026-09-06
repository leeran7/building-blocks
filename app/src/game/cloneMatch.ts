/**
 * Deep clone of MatchState for replay snapshots and export sims.
 * Prefer structuredClone; fall back to JSON for exotic hosts.
 */

import type { MatchState } from "./types";

export function cloneMatchState(state: MatchState): MatchState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as MatchState;
}
