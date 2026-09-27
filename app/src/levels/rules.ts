/**
 * Level System rules: lives, XP, player level and stars.
 *
 * Pure functions only, so the numbers in the design doc
 * (design/xp-and-levels.md §4, §5) live in one place and are shared by the
 * routes (src/db/levels.ts) and, later, the mobile screens. Nothing here reads
 * a request: every input is server state or a server re-simulation.
 */

import { TICK_HZ } from "../game/types";

// ── Lives (§5b) ──────────────────────────────────────────────────────────────

/** Most lives a player can hold. */
export const MAX_LIVES = 5;

/** One life comes back every 30 minutes. */
export const LIFE_REFILL_MS = 30 * 60 * 1000;

/** Levels at or under this number are the tutorial and cost no life. */
export const FREE_LIVES_THROUGH_LEVEL = 10;

/** Race ticks from GO under which a failed attempt is a bad start: 3 s. */
export const EARLY_RESTART_TICKS = 3 * TICK_HZ;

/**
 * Slack, in ms, on top of the countdown and the run itself, for a bad start
 * to still count as one: network and app latency between GO and the submit.
 * Kept small, because it is also how long a modified client could play a
 * ticket locally before claiming a bad start.
 */
export const BAD_START_SLACK_MS = 5_000;

/** Countdown before GO (COUNTDOWN_TICKS at TICK_HZ). */
const COUNTDOWN_MS = 3_000;

/** Longest a ticket can have been open and still end in a bad start. */
export const BAD_START_WINDOW_MS = COUNTDOWN_MS + (EARLY_RESTART_TICKS * 1000) / TICK_HZ + BAD_START_SLACK_MS;

/**
 * Whether a failed run is a bad start whose life is refunded. The server's
 * re-simulation ends where the submitted log ends, so the replay's length is
 * client-controlled: a short log alone proves nothing. The run must end
 * within EARLY_RESTART_TICKS of GO, AND be submitted within countdown + the
 * run + BAD_START_SLACK_MS of the ticket being issued (server clock).
 */
export function isBadStart(raceTicks: number, ticketIssuedAt: Date, now: Date): boolean {
  if (!(raceTicks >= 0 && raceTicks < EARLY_RESTART_TICKS)) return false;
  const elapsed = now.getTime() - ticketIssuedAt.getTime();
  return elapsed <= COUNTDOWN_MS + (raceTicks * 1000) / TICK_HZ + BAD_START_SLACK_MS;
}

/**
 * Whether an open ticket closed by starting a new one counts as a restart
 * within 3 s of GO (refunded) rather than an abandoned run. Decided only by
 * the server clock, since no replay was submitted.
 */
export function isQuickRestart(ticketIssuedAt: Date, now: Date): boolean {
  return now.getTime() - ticketIssuedAt.getTime() <= BAD_START_WINDOW_MS;
}

/** Stored life state: the users.lives / users.lives_updated_at columns. */
export interface LifeState {
  lives: number;
  /** When the refill timer last advanced. Null means it has never run. */
  updatedAt: Date | null;
}

/** Whether starting `level` spends a life. */
export function levelCostsLife(level: number): boolean {
  return level > FREE_LIVES_THROUGH_LEVEL;
}

/**
 * Lives right now, with the refill applied. The timer only moves forward in
 * whole 30-minute steps, so partial refill time is kept (§5b): 45 minutes
 * after dropping to 3 lives you have 4, and the next life is 15 minutes away.
 * A full player's timer is irrelevant and is not moved.
 *
 * A corrupt stored value never grants more than MAX_LIVES or fewer than 0.
 */
export function refillLives(state: LifeState, now: Date): LifeState {
  const stored = Math.min(MAX_LIVES, Math.max(0, Math.floor(state.lives)));
  if (stored >= MAX_LIVES || state.updatedAt === null) {
    return { lives: stored, updatedAt: state.updatedAt };
  }
  const elapsed = now.getTime() - state.updatedAt.getTime();
  // A timer in the future (clock skew) grants nothing and is left alone.
  if (elapsed < LIFE_REFILL_MS) return { lives: stored, updatedAt: state.updatedAt };
  const steps = Math.floor(elapsed / LIFE_REFILL_MS);
  const lives = Math.min(MAX_LIVES, stored + steps);
  return {
    lives,
    updatedAt: new Date(state.updatedAt.getTime() + steps * LIFE_REFILL_MS),
  };
}

/**
 * Spend one life, after refilling. Null when the player has none left.
 * Spending from full starts the refill timer now; spending below full keeps
 * the running timer so partial time is not lost.
 */
export function spendLife(state: LifeState, now: Date): LifeState | null {
  const current = refillLives(state, now);
  if (current.lives <= 0) return null;
  return {
    lives: current.lives - 1,
    updatedAt: current.lives >= MAX_LIVES ? now : current.updatedAt,
  };
}

/** Give one life back (a clear, or a bad start), capped at MAX_LIVES. */
export function refundLife(state: LifeState, now: Date): LifeState {
  const current = refillLives(state, now);
  return { lives: Math.min(MAX_LIVES, current.lives + 1), updatedAt: current.updatedAt };
}

/** When the next life arrives, or null when the player is full. */
export function nextLifeAt(state: LifeState, now: Date): Date | null {
  const current = refillLives(state, now);
  if (current.lives >= MAX_LIVES || current.updatedAt === null) return null;
  return new Date(current.updatedAt.getTime() + LIFE_REFILL_MS);
}

// ── Levels and episodes ──────────────────────────────────────────────────────

/** Levels in a season (§3d). */
export const LEVELS_PER_SEASON = 300;

/** Levels in an episode (§2). */
export const LEVELS_PER_EPISODE = 15;

/** Every 5th level is a Hard level (§2, §3). */
export function isHardLevel(level: number): boolean {
  return level % 5 === 0;
}

/** Whether `n` is a level number in a season: an integer in 1..300. */
export function isLevelNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= LEVELS_PER_SEASON;
}

/** 1-based episode a level belongs to. */
export function episodeOf(level: number): number {
  return Math.floor((level - 1) / LEVELS_PER_EPISODE) + 1;
}

/** Highest level a player may start: one past the highest cleared (0 = none). */
export function frontierAfter(highestCleared: number): number {
  return highestCleared + 1;
}

/** First and last level of an episode. */
export function episodeLevels(episode: number): { first: number; last: number } {
  const first = (episode - 1) * LEVELS_PER_EPISODE + 1;
  return { first, last: first + LEVELS_PER_EPISODE - 1 };
}

// ── Stars (§4) ───────────────────────────────────────────────────────────────

/**
 * Star thresholds for one level, in race ticks from GO. They come from the
 * server's own copy of the season manifest (the bot's route time × 1.25 and
 * × 1.05, looser on L1–10), never from the client.
 */
export interface LevelPars {
  twoStarTicks: number;
  threeStarTicks: number;
}

/**
 * Stars for a run, from the server's finish tick. 0 means not cleared.
 * `allGems` is false only on a Collect level where a gem was missed, which
 * caps the run at 2 stars.
 */
export function starsForRun(
  finishTicks: number | null,
  pars: LevelPars,
  allGems = true
): 0 | 1 | 2 | 3 {
  if (finishTicks === null || !Number.isFinite(finishTicks) || finishTicks < 0) return 0;
  if (finishTicks <= pars.threeStarTicks && allGems) return 3;
  if (finishTicks <= pars.twoStarTicks) return 2;
  return 1;
}

// ── XP and player level (§5a) ────────────────────────────────────────────────

/** XP for each new star on a level. */
export const STAR_XP = 25;

/** XP for clearing every level of an episode. */
export const EPISODE_XP = 250;

/** XP for the first clear of a level: 50 + 5·N, doubled on Hard levels. */
export function firstClearXp(level: number): number {
  const base = 50 + 5 * level;
  return isHardLevel(level) ? base * 2 : base;
}

/** XP needed to go from player level L to L+1: round(60·L^1.35). */
export function xpToNextLevel(playerLevel: number): number {
  return Math.round(60 * Math.pow(playerLevel, 1.35));
}

/** Where a lifetime XP total puts the player. */
export interface PlayerLevelProgress {
  /** Player level, starting at 1. */
  level: number;
  /** XP earned since reaching `level`. */
  xpIntoLevel: number;
  /** XP needed to go from `level` to the next. */
  xpForNextLevel: number;
}

/**
 * Player level for a lifetime XP total. Everyone starts at level 1.
 * Bounded so a corrupt total cannot spin forever.
 */
export function playerLevelProgress(xp: number): PlayerLevelProgress {
  let level = 1;
  let remaining = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  while (level < 10_000) {
    const step = xpToNextLevel(level);
    if (remaining < step) break;
    remaining -= step;
    level += 1;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpToNextLevel(level) };
}

/** Player level for a lifetime XP total (the users.player_level cache). */
export function playerLevelForXp(xp: number): number {
  return playerLevelProgress(xp).level;
}

/** An XP award keyed so it can only ever be paid once (§7 XpGrant keys). */
export interface XpAward {
  source: "first_clear" | "star" | "episode";
  key: string;
  amount: number;
}

/**
 * The XP awards a verified clear can earn. The database pays each key at
 * most once, so it is safe to list awards a replay already earned before.
 *
 * @param season        season id
 * @param level         level number
 * @param stars         stars this run earned (server-derived), 1..3
 * @param episodeCleared true when every level of the level's episode is now cleared
 */
export function xpAwardsForClear(
  season: number,
  level: number,
  stars: number,
  episodeCleared: boolean
): XpAward[] {
  if (stars < 1) return [];
  const awards: XpAward[] = [
    { source: "first_clear", key: `first_clear:${season}:${level}`, amount: firstClearXp(level) },
  ];
  for (let k = 1; k <= Math.min(3, stars); k++) {
    awards.push({ source: "star", key: `star:${season}:${level}:${k}`, amount: STAR_XP });
  }
  if (episodeCleared) {
    const episode = episodeOf(level);
    awards.push({ source: "episode", key: `episode:${season}:${episode}`, amount: EPISODE_XP });
  }
  return awards;
}
