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

// ── Stuck help (§5c) ─────────────────────────────────────────────────────────

/** Fails at one frontier level after which every try starts with a free booster. */
export const STUCK_BOOSTER_FAILS = 3;

/** Fails at one frontier level after which the bot's route ghost is offered. */
export const ROUTE_GHOST_FAILS = 5;

/**
 * Stored fails at the player's frontier: the users.level_fail_* columns. One
 * level at a time, since only the frontier level can be failed toward it.
 */
export interface FailTally {
  season: number;
  level: number;
  count: number;
}

/**
 * The tally after a ticket closes. A fail or an abandoned ticket at the
 * frontier adds one (starting over when the level differs from the stored
 * one), a clear there resets it, and a replay or bad start leaves it alone.
 */
export function nextFailTally(
  tally: FailTally | null,
  at: { season: number; level: number },
  outcome: TicketOutcome,
  atFrontier: boolean
): FailTally | null {
  if (!atFrontier) return tally;
  if (outcome === "cleared") return null;
  if (outcome !== "failed" && outcome !== "abandoned") return tally;
  const same = tally !== null && tally.season === at.season && tally.level === at.level;
  return { season: at.season, level: at.level, count: (same ? saneCount(tally.count) : 0) + 1 };
}

/** Fails recorded at one level (0 when the tally is for another level). */
export function failsAt(tally: FailTally | null, season: number, level: number): number {
  return tally !== null && tally.season === season && tally.level === level ? saneCount(tally.count) : 0;
}

/**
 * Stuck help's booster order: the ones that most often turn a near-miss into
 * a clear first. The pick rotates through the level's allowed types in this
 * order, one step per fail past STUCK_BOOSTER_FAILS, so it is deterministic
 * and a player who is still stuck gets a different kind of help.
 */
export const STUCK_HELP_ORDER: readonly BoosterType[] = [
  "slow-lava",
  "super-jump",
  "rapid-climb",
  "giant",
  "sprint-burst",
  "jetpack",
  "harden-lava",
];

/** The free booster after STUCK_BOOSTER_FAILS fails at a level, or null. */
export function stuckHelpPowerUp(fails: number, allowed: readonly BoosterType[]): BoosterType | null {
  const n = saneCount(fails);
  if (n < STUCK_BOOSTER_FAILS) return null;
  const pool = STUCK_HELP_ORDER.filter((t) => allowed.includes(t));
  if (pool.length === 0) return null;
  return pool[(n - STUCK_BOOSTER_FAILS) % pool.length] ?? null;
}

/** Whether the bot's route ghost is offered after this many fails. */
export function routeGhostAvailable(fails: number): boolean {
  return saneCount(fails) >= ROUTE_GHOST_FAILS;
}

// ── Starting power-up ────────────────────────────────────────────────────────

export interface FreeStartInput {
  /** The ticket's level is the player's frontier in its season. */
  atFrontier: boolean;
  streak: number;
  /** Fails recorded at this level (failsAt). */
  fails: number;
  /** Booster types the level allows (boosterTypesOf its allowed set). */
  allowed: readonly BoosterType[];
}

/**
 * The free power-up the server grants a new ticket, or null. Only frontier
 * levels get one, and the streak takes precedence over stuck help (a player
 * cannot have both: a fail resets the streak).
 */
export function freeStartPowerUp(input: FreeStartInput): StartPowerUp | null {
  if (!input.atFrontier) return null;
  const streak = streakPowerUp(input.streak, input.allowed);
  if (streak !== null) return { type: streak, source: "streak" };
  const help = stuckHelpPowerUp(input.fails, input.allowed);
  if (help !== null) return { type: help, source: "stuck_help" };
  return null;
}

/** Most power-ups a level run starts with: one free, one booster. */
export const MAX_START_POWER_UPS = 2;

/** What a new ticket starts with, and what happens to a chosen booster. */
export interface StartGrant {
  /** Granted at GO, in order: the free power-up first, then the booster. */
  startPowerUps: StartPowerUp[];
  /** The booster to take from the inventory, or null. */
  spend: BoosterType | null;
  /** A chosen booster left in the inventory because the free one is the same type. */
  kept: BoosterType | null;
}

/**
 * A run starts with its free power-up (streak or stuck help) AND the booster
 * the player chose: one does not cancel the other, and at most one booster
 * is ever chosen. The one exception is a booster of the free power-up's own
 * type. Granting a live type again only refreshes it (grantPowerUp), so
 * spending it would take the booster for nothing: it is kept, not spent, and
 * reported as `kept` so the app can say so.
 */
export function startGrant(free: StartPowerUp | null, chosen: BoosterType | null): StartGrant {
  if (chosen !== null && free !== null && chosen === free.type) {
    return { startPowerUps: [free], spend: null, kept: chosen };
  }
  const startPowerUps: StartPowerUp[] = free === null ? [] : [free];
  if (chosen !== null) startPowerUps.push({ type: chosen, source: "booster" });
  return { startPowerUps, spend: chosen, kept: null };
}

// ── Star chests (§6.4) ───────────────────────────────────────────────────────

/** Lifetime stars per chest. */
export const STARS_PER_CHEST = 20;

/** Most boosters one chest holds (it always holds at least one). */
export const MAX_CHEST_BOOSTERS = 2;

/** Chests a lifetime star total has earned (chest numbers 1..n). */
export function chestsEarned(lifetimeStars: number): number {
  return Math.floor(saneCount(lifetimeStars) / STARS_PER_CHEST);
}

/** Progress toward the next chest, for the map: "13 / 20". */
export function chestProgress(lifetimeStars: number): { starsIntoChest: number; perChest: number; earned: number } {
  const stars = saneCount(lifetimeStars);
  return { starsIntoChest: stars % STARS_PER_CHEST, perChest: STARS_PER_CHEST, earned: chestsEarned(stars) };
}

/**
 * A chest's boosters from its roll (the HMAC digest, starChestServer.ts):
 * byte 0 picks one or two boosters, and each is a 32-bit big-endian word
 * from byte 4 on, modulo the pool. Empty when the pool is empty or the
 * digest is too short, so the caller can refuse rather than invent contents.
 */
export function chestBoostersFromRoll(roll: Uint8Array, pool: readonly BoosterType[]): BoosterType[] {
  if (pool.length === 0 || roll.length < 4 + 4 * MAX_CHEST_BOOSTERS) return [];
  const count = 1 + ((roll[0] ?? 0) % MAX_CHEST_BOOSTERS);
  const out: BoosterType[] = [];
  for (let i = 0; i < count; i++) {
    const o = 4 + 4 * i;
    const word = (((roll[o] ?? 0) << 24) | ((roll[o + 1] ?? 0) << 16) | ((roll[o + 2] ?? 0) << 8) | (roll[o + 3] ?? 0)) >>> 0;
    const pick = pool[word % pool.length];
    if (pick !== undefined) out.push(pick);
  }
  return out;
}

/** A booster inventory: count per type, only types with a count above 0. */
export type BoosterInventory = Partial<Record<BoosterType, number>>;

/** Inventory rows (type, count) as a map, dropping unknown types and empty counts. */
export function boosterInventory(rows: readonly { type: string; count: number }[]): BoosterInventory {
  const out: BoosterInventory = {};
  for (const r of rows) {
    const type = parseBoosterType(r.type);
    const count = saneCount(r.count);
    if (type !== null && count > 0) out[type] = count;
  }
  return out;
}
