/**
 * Pure helpers for shared-replay transport: speeds, seek math, rewind, and the
 * keyboard predicate that mirrors live-play interactive-target exemption.
 */

import { TICK_HZ } from "./types";

export const REWIND_STEP_TICKS = 150;
export const REPLAY_SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export const SNAPSHOT_INTERVAL_TICKS = 120;

/** Hold-repeat for rewind: at most one fire per this many ms. */
export const REWIND_REPEAT_MS = 200;

const REPLAY_KEYS = new Set([
  " ",
  "Spacebar",
  "k",
  "K",
  "j",
  "J",
  "l",
  "L",
  ".",
  "Home",
  "0",
]);

/** Cycle 1 → 2 → 4 → 1. */
export function cycleReplaySpeed(current: ReplaySpeed): ReplaySpeed {
  const i = REPLAY_SPEEDS.indexOf(current);
  const next = i < 0 ? 0 : (i + 1) % REPLAY_SPEEDS.length;
  return REPLAY_SPEEDS[next];
}

/** Alias used in some call sites / docs. */
export const nextSpeed = cycleReplaySpeed;

export function rewindTargetTick(tick: number): number {
  if (!Number.isFinite(tick)) return 0;
  return Math.max(0, Math.floor(tick) - REWIND_STEP_TICKS);
}

/** Alias. */
export const rewindTick = rewindTargetTick;

/**
 * Seek ratio r ∈ [0,1] → climb tick. AC-7:
 * clamp(round(r × (N − 1)), 0, N − 1).
 */
export function tickFromSeekRatio(r: number, n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(r)) return 0;
  const clamped = Math.min(1, Math.max(0, r));
  return Math.min(n - 1, Math.max(0, Math.round(clamped * (n - 1))));
}

/** Alias. */
export const seekTickFromRatio = tickFromSeekRatio;

/** mm:ss from climb tick at 30 Hz. */
export function formatReplayClock(tick: number): string {
  const safe = Number.isFinite(tick) && tick > 0 ? Math.floor(tick) : 0;
  const totalSec = Math.floor(safe / TICK_HZ);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Whether a keydown should drive replay transport and suppress default.
 * False when not replaying, when focus is on an interactive control, or when
 * the key is not a transport binding (AC-3 negative / AC-20).
 */
export function shouldCaptureReplayKey(
  key: string,
  replaying: boolean,
  targetIsInteractive: boolean
): boolean {
  if (!replaying) return false;
  if (targetIsInteractive) return false;
  return REPLAY_KEYS.has(key);
}
