/**
 * Server-side plausibility bound for a self-reported climb result.
 *
 * POST /api/climb/result takes peakY from the client, and src/db/climb.ts
 * persists it with Math.max — the record only ever rises. A single request
 * claiming an arbitrary height therefore takes rank 1 on the public free-stack
 * leaderboard permanently, and no later honest run can displace it. That makes
 * peakY a hard trust boundary, not the private self-reported figure the route's
 * docblock used to describe.
 *
 * This module does not make the score trustworthy. It bounds the damage: a
 * claim is rejected unless it is reachable by the fastest tower in the game,
 * running the strongest ascent power-up, for the whole claimed duration. The
 * real fix is re-deriving peakY server-side from seed + input log, which is
 * what the ranked path is specified to do (AC-17).
 *
 * The bound is deliberately generous. Every term takes the most favourable
 * value available anywhere in the game, so no honest run can fail it.
 */

import { TICK_DT, TICK_HZ } from "./types";
import { FASTEST_ARCHETYPE } from "./towers";
import { RAPID_CLIMB_MULT, JETPACK_MAX_VY } from "./powerups";

/**
 * The fastest sustained ascent the simulation can produce, in metres/second.
 *
 * Two candidates besides the jetpack cap: a ladder climbed under rapid-climb,
 * and jumping. The jump term uses the launch velocity itself, which no run
 * can sustain — vertical speed decays to zero at the apex under gravity, and
 * a jump only nets height if it lands somewhere higher. Using it anyway keeps
 * this an unambiguous over-estimate, which is the point.
 */
export const MAX_ASCENT_SPEED_MPS = Math.max(
  FASTEST_ARCHETYPE.maxClimbSpeed * RAPID_CLIMB_MULT,
  FASTEST_ARCHETYPE.jumpSpeed,
  JETPACK_MAX_VY
);

/**
 * Longest run the server will record, in ticks (6 hours). finishedTick is
 * itself client-supplied, so without this the height bound below could be
 * stretched arbitrarily just by claiming a longer run.
 */
export const MAX_RUN_TICKS = 6 * 60 * 60 * TICK_HZ;

/** Slack for float drift and platform-inheritance, in metres. */
const TOLERANCE_M = 1;

/**
 * The highest peakY reachable in `ticks` ticks, starting from ground.
 */
export function maxReachablePeakY(ticks: number): number {
  return MAX_ASCENT_SPEED_MPS * ticks * TICK_DT + TOLERANCE_M;
}

/**
 * Decide whether a reported run is physically possible.
 *
 * A run with no tick count cannot be bounded at all, so it is rejected rather
 * than trusted — the client always knows how long its own run was.
 */
export function checkClimbResult(
  peakY: number,
  ticks: number | null
): ClimbResultCheck {
  if (!Number.isFinite(peakY) || peakY < 0) {
    return { ok: false, reason: "peakY must be a non-negative finite number" };
  }

  if (ticks === null || !Number.isFinite(ticks)) {
    return { ok: false, reason: "a tick count is required to bound peakY" };
  }

  if (ticks < 0) {
    return { ok: false, reason: "tick count must be non-negative" };
  }

  if (ticks > MAX_RUN_TICKS) {
    return {
      ok: false,
      reason: `tick count exceeds the maximum run length of ${MAX_RUN_TICKS} ticks`,
    };
  }

  const ceiling = maxReachablePeakY(ticks);
  if (peakY > ceiling) {
    return {
      ok: false,
      reason: `peakY ${peakY} exceeds the ${ceiling.toFixed(2)}m reachable in ${ticks} ticks`,
    };
  }

  return { ok: true };
}

export type ClimbResultCheck =
  | { ok: true }
  | { ok: false; reason: string };
