/**
 * Tower v3 "The Climb" — input validation & height anti-cheat (server-side).
 *
 * Money is involved in ranked play, so the server trusts ONLY inputs and derives
 * all positions (spec-next.md, Netcode → Anti-cheat; AC-15, AC-16, AC-18). This
 * module is the seam the implementer handoff flagged: every input is bounds-
 * validated before stepMatch integrates it, and a height-rate sentinel flags
 * impossible climbs.
 *
 * Pure and deterministic — safe to run inside the authoritative tick.
 */

import { PlayerInput, PlayerState, TowerSpec, TICK_DT, NO_INPUT } from "./types";

/** Result of validating a single player's input for one tick. */
export interface InputValidation {
  input: PlayerInput;
  rejected: boolean;
  reason?: string;
}

/**
 * Validate a raw client input against the legal move-set and the player's state
 * (AC-15). Illegal fields are neutralized rather than trusted; an illegal input
 * is reported so the caller can flag/rate-limit the connection.
 */
export function validateInput(raw: unknown, player: PlayerState): InputValidation {
  if (typeof raw !== "object" || raw === null) {
    return { input: NO_INPUT, rejected: true, reason: "malformed input" };
  }
  const r = raw as Record<string, unknown>;

  const moveX = clampAxis(r.moveX);
  const jump = r.jump === true;
  let climbY = clampAxis(r.climbY);
  const usePowerUp = r.usePowerUp === true;

  let rejected = false;
  let reason: string | undefined;

  // Legal state transition: you cannot climb (vertical ladder input) unless you
  // are actually overlapping a ladder. Climbing off a ladder is a classic spoof.
  if (climbY !== 0 && !player.onLadder) {
    climbY = 0;
    rejected = true;
    reason = "climb input without ladder overlap";
  }

  // Jump is only legal from the ground (no infinite air-jumps without a power-up;
  // power-up handling is layered on later and would set an explicit allowance).
  if (jump && !player.onGround && !player.onLadder) {
    rejected = true;
    reason = reason ?? "jump while airborne";
    // Keep jump=false so the sim never grants an illegal jump.
    return {
      input: { moveX, jump: false, climbY, usePowerUp },
      rejected: true,
      reason,
    };
  }

  return { input: { moveX, jump, climbY, usePowerUp }, rejected, reason };
}

function clampAxis(v: unknown): -1 | 0 | 1 {
  if (v === 1 || v === -1) return v;
  return 0;
}

/**
 * Height-rate sentinel (AC-15, AC-16). Given a player's height before and after
 * a tick, confirm the gain does not exceed the tower's maximum legal climb rate
 * (plus a small tolerance for float + platform-inheritance). Returns true if the
 * delta is LEGAL.
 */
export function isHeightDeltaLegal(
  prevY: number,
  nextY: number,
  tower: TowerSpec,
  toleranceM = 0.01
): boolean {
  const maxGain = tower.maxClimbSpeed * TICK_DT + toleranceM;
  return nextY - prevY <= maxGain;
}

/** Per-player rolling sentinel state for the K-consecutive-tick rule (AC-16). */
export interface SentinelState {
  consecutiveViolations: number;
  flagged: boolean;
}

export function newSentinel(): SentinelState {
  return { consecutiveViolations: 0, flagged: false };
}

/**
 * Update the sentinel after a tick. If the height delta was illegal for K
 * consecutive ticks, flag the player (voids ranked payout downstream, AC-16).
 */
export function updateSentinel(
  s: SentinelState,
  legal: boolean,
  K = 5
): SentinelState {
  if (legal) {
    s.consecutiveViolations = 0;
  } else {
    s.consecutiveViolations += 1;
    if (s.consecutiveViolations >= K) s.flagged = true;
  }
  return s;
}
