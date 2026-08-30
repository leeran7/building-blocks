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
import {
  RAPID_CLIMB_MULT,
  JETPACK_MAX_VY,
  doubleJumpChargesRemaining,
  isPowerUpActive,
  jetpackFuelRemaining,
} from "./powerups";

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
 *
 * climbY is NOT gated on player.onLadder. Off-ladder climb intent is how the
 * sim grabs a ladder; neutralizing it made every honest grab look like a spoof
 * and would have made ladders unreachable once this ran in front of stepMatch.
 * The sim already no-ops climbY when no ladder is in reach.
 */
export function validateInput(
  raw: unknown,
  player: PlayerState,
  tick = 0
): InputValidation {
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

  // Jump is only legal from the ground — an air-jump is the classic spoof.
  // Double-jump spends a charge on the edge; a live jetpack with fuel lets
  // the player hold jump to thrust. Both are the allowance those pickups buy.
  const mayAirJump =
    doubleJumpChargesRemaining(player, tick) > 0 ||
    jetpackFuelRemaining(player, tick) > 0;
  if (jump && !player.onGround && !player.onLadder && !mayAirJump) {
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
 * a tick, confirm the gain does not exceed the fastest ascent the simulation
 * itself can produce (plus a small tolerance for float + platform-inheritance).
 * Returns true if the delta is LEGAL.
 *
 * The envelope is the maximum of the ascent speeds the sim itself can
 * produce, not just the ladder rate: climbing is capped at maxClimbSpeed, a
 * jump leaves the ground at jumpSpeed (higher on every archetype), and a
 * jetpack holds JETPACK_MAX_VY while thrusting. Bounding by the climb rate
 * alone flagged honest play — a plain jump spent 4 consecutive ticks over
 * the limit against a K of 5. climbSpeedMult scales only the climb term
 * because that is the only one rapid-climb affects.
 */
export function isHeightDeltaLegal(
  prevY: number,
  nextY: number,
  tower: TowerSpec,
  toleranceM = 0.01,
  climbSpeedMult = 1
): boolean {
  const maxRise = Math.max(
    tower.maxClimbSpeed * climbSpeedMult,
    tower.jumpSpeed,
    JETPACK_MAX_VY
  );
  return nextY - prevY <= maxRise * TICK_DT + toleranceM;
}

/**
 * The climb-rate allowance a player has earned this tick. Rapid-climb raises the
 * legal ceiling for as long as it runs; without this the sentinel would flag the
 * power-up it was shipped alongside.
 */
export function legalClimbSpeedMult(player: PlayerState, tick: number): number {
  return isPowerUpActive(player, "rapid-climb", tick) ? RAPID_CLIMB_MULT : 1;
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
