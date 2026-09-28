/**
 * Level System engagement rules: win streaks, stuck help and star chests
 * (design/xp-and-levels.md §5c, §6.3, §6.4).
 *
 * Pure functions only, shared by the server (src/db/levels.ts) and the app's
 * display code. Every input is server state: a ticket's outcome, whether its
 * level was the player's frontier, and the level's allowed power-ups from the
 * season manifest. Nothing here reads a request.
 */

import type { PowerUpType } from "../game/types";

// ── Boosters ─────────────────────────────────────────────────────────────────

/** A concrete power-up a run can start with. The random orb is never one. */
export type BoosterType = Exclude<PowerUpType, "random">;

/** Allow-list of booster types, keyed for Object.hasOwn lookups. */
const BOOSTER_TYPE_SET: Readonly<Record<BoosterType, true>> = {
  "rapid-climb": true,
  "sprint-burst": true,
  "super-jump": true,
  "slow-lava": true,
  giant: true,
  jetpack: true,
  "harden-lava": true,
};

/** Every booster type, in unlock order (§3a). */
export const BOOSTER_TYPES: readonly BoosterType[] = [
  "rapid-climb",
  "sprint-burst",
  "super-jump",
  "slow-lava",
  "giant",
  "jetpack",
  "harden-lava",
];

/** A booster type, or null for anything else (allow-list, never a default). */
export function parseBoosterType(raw: unknown): BoosterType | null {
  return typeof raw === "string" && Object.hasOwn(BOOSTER_TYPE_SET, raw) ? (raw as BoosterType) : null;
}

/** The booster types in a level's allowed power-up set ("random" dropped). */
export function boosterTypesOf(allowed: readonly PowerUpType[]): BoosterType[] {
  const out: BoosterType[] = [];
  for (const t of allowed) {
    const b = parseBoosterType(t);
    if (b !== null && !out.includes(b)) out.push(b);
  }
  return out;
}

/** How a run's starting power-up was decided. */
export type StartPowerUpSource = "streak" | "stuck_help" | "booster";

export interface StartPowerUp {
  type: BoosterType;
  source: StartPowerUpSource;
}

// ── Ticket outcomes ──────────────────────────────────────────────────────────

/** How a run ticket closed (level_run_tickets.outcome). */
export type TicketOutcome = "cleared" | "failed" | "bad_start" | "abandoned";

// ── Win streaks (§6.3) ───────────────────────────────────────────────────────

/** First clears in a row at the frontier that start the next level with a rapid climb. */
export const STREAK_RAPID_CLIMB = 3;

/** First clears in a row at the frontier that start the next level with a super jump. */
export const STREAK_SUPER_JUMP = 5;

/** A stored streak as a whole, non-negative count (a corrupt value reads as 0). */
function saneCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * The streak after a ticket closes. Only runs at the player's frontier level
 * move it: a clear there (always a first clear) adds one, a fail or an
 * abandoned ticket resets it. Replays of cleared levels neither count nor
 * break it, which stops farming L1, and a bad start is neutral.
 */
export function nextStreak(streak: number, outcome: TicketOutcome, atFrontier: boolean): number {
  const current = saneCount(streak);
  if (!atFrontier) return current;
  if (outcome === "cleared") return current + 1;
  if (outcome === "failed" || outcome === "abandoned") return 0;
  return current;
}

/**
 * The power-up a streak earns on a frontier level: a super jump from
 * STREAK_SUPER_JUMP, a rapid climb from STREAK_RAPID_CLIMB, and only types the
 * level allows. A streak of 5+ on a level that does not allow the super jump
 * yet still earns the rapid climb when that is allowed.
 */
export function streakPowerUp(streak: number, allowed: readonly BoosterType[]): BoosterType | null {
  const current = saneCount(streak);
  if (current >= STREAK_SUPER_JUMP && allowed.includes("super-jump")) return "super-jump";
  if (current >= STREAK_RAPID_CLIMB && allowed.includes("rapid-climb")) return "rapid-climb";
  return null;
}

// ── Starting power-up ────────────────────────────────────────────────────────

export interface FreeStartInput {
  /** The ticket's level is the player's frontier in its season. */
  atFrontier: boolean;
  streak: number;
  /** Booster types the level allows (boosterTypesOf its allowed set). */
  allowed: readonly BoosterType[];
}

/**
 * The free power-up the server grants a new ticket, or null. Only frontier
 * levels get one.
 */
export function freeStartPowerUp(input: FreeStartInput): StartPowerUp | null {
  if (!input.atFrontier) return null;
  const streak = streakPowerUp(input.streak, input.allowed);
  if (streak !== null) return { type: streak, source: "streak" };
  return null;
}
