import { TICK_HZ } from "@app/game/types";
import {
  MAX_CHEST_BOOSTERS,
  boosterInventory,
  boosterTypesOf,
  chestBoostersFromRoll,
  chestProgress,
  chestsEarned,
  failsAt,
  freeStartPowerUp,
  nextFailTally,
  nextStreak,
  type BoosterInventory,
  type FailTally,
} from "@app/levels/engagement";
import { season1Catalog } from "./catalog";
import {
  EPISODE_SIZE,
  isHardLevel,
  starsForTime,
  type LevelBoardView,
  type LevelNode,
  type LevelResult,
  type LevelRunReport,
  type LevelsClient,
  type OpenedChest,
  type PlayerStats,
  type SeasonView,
  type StarCount,
  type StartOptions,
  type StartResult,
} from "./model";

/**
 * A device-local stand-in for the level API, so the map, start, win and lose
 * screens can be play-tested before the server routes and the season manifest
 * exist. It follows the doc's rules (§3–§5) closely enough to feel right:
 * lives spent at start and refunded on a clear, 30-minute refills, XP for
 * first clears and new stars. Nothing here is trusted or sent anywhere.
 *
 * Levels are the real season 1 levels (./catalog); only the player's
 * progress, lives and XP are local.
 */

export const SEASON_LENGTH = 300;
export const MAX_LIVES = 5;
export const LIFE_REFILL_MS = 30 * 60 * 1000;
/** L1–10 are tutorial levels and cost no lives (§5b). */
export const FREE_LEVELS = 10;

const STORAGE_PREFIX = "doomstack:levels:mock:v1";

/** XP for the step from player level L to L+1 (§5a). */
export function xpForPlayerLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.35));
}

interface StoredProgress {
  stars: StarCount;
  bestMs: number;
}

export interface MockState {
  progress: Record<string, StoredProgress>;
  lives: number;
  livesUpdatedAt: number;
  xp: number;
  openTicket: { id: string; level: number } | null;
  /** Win streak (§6.3); 0 in stores written before streaks existed. */
  streak: number;
  /** Fails at the frontier level (§5c); absent in older stores. */
  fails?: FailTally | null;
  /** Owned boosters (§6.4); absent in older stores. */
  boosters?: BoosterInventory;
  /** Star chests opened so far (chest numbers 1..n); absent in older stores. */
  chestsOpened?: number;
}

function freshState(now: number): MockState {
  return { progress: {}, lives: MAX_LIVES, livesUpdatedAt: now, xp: 0, openTicket: null, streak: 0 };
}

function isStarCount(v: unknown): v is StarCount {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

function parseTally(v: unknown): FailTally | null {
  if (typeof v !== "object" || v === null) return null;
  const t = v as Record<string, unknown>;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return whole(t.season) && whole(t.level) && whole(t.count) ? { season: t.season, level: t.level, count: t.count } : null;
}

/** Reads a stored state, or null when it is missing or malformed. */
export function parseMockState(raw: string | null): MockState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.lives !== "number" ||
    typeof o.livesUpdatedAt !== "number" ||
    typeof o.xp !== "number" ||
    typeof o.progress !== "object" ||
    o.progress === null
  ) {
    return null;
  }
  const progress: Record<string, StoredProgress> = {};
  for (const [key, row] of Object.entries(o.progress as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || typeof row !== "object" || row === null) return null;
    const r = row as Record<string, unknown>;
    if (!isStarCount(r.stars) || typeof r.bestMs !== "number") return null;
    progress[key] = { stars: r.stars, bestMs: r.bestMs };
  }
  const t = o.openTicket;
  const openTicket =
    typeof t === "object" && t !== null &&
    typeof (t as Record<string, unknown>).id === "string" &&
    typeof (t as Record<string, unknown>).level === "number"
      ? { id: (t as { id: string }).id, level: (t as { level: number }).level }
      : null;
  return {
    progress,
    lives: Math.max(0, Math.min(MAX_LIVES, Math.floor(o.lives))),
    livesUpdatedAt: o.livesUpdatedAt,
    xp: Math.max(0, Math.floor(o.xp)),
    openTicket,
    streak: typeof o.streak === "number" && Number.isFinite(o.streak) ? Math.max(0, Math.floor(o.streak)) : 0,
    fails: parseTally(o.fails),
    boosters: parseInventory(o.boosters),
    chestsOpened: typeof o.chestsOpened === "number" && Number.isInteger(o.chestsOpened) && o.chestsOpened >= 0 ? o.chestsOpened : 0,
  };
}

function parseInventory(v: unknown): BoosterInventory {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const rows: { type: string; count: number }[] = [];
  for (const [type, count] of Object.entries(v as Record<string, unknown>)) {
    if (typeof count === "number") rows.push({ type, count });
  }
  return boosterInventory(rows);
}

function lifetimeStarsOf(state: MockState): number {
  let total = 0;
  for (const row of Object.values(state.progress)) total += row.stars;
  return total;
}

/**
 * A device-local chest roll: 12 bytes of FNV-1a over the account and chest
 * number. Not secret and not meant to be: the server rolls real chests with
 * an HMAC (starChestServer.ts); this only makes the mock feel the same.
 */
export function mockChestRoll(accountKey: string, chestNumber: number): Uint8Array {
  const out = new Uint8Array(4 + 4 * MAX_CHEST_BOOSTERS);
  for (let word = 0; word < out.length / 4; word++) {
    let h = 0x811c9dc5;
    const text = `${accountKey}:${chestNumber}:${word}`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out[word * 4] = h >>> 24;
    out[word * 4 + 1] = (h >>> 16) & 0xff;
    out[word * 4 + 2] = (h >>> 8) & 0xff;
    out[word * 4 + 3] = h & 0xff;
  }
  return out;
}

/**
 * Lives after refills up to `now` (§5b): one per 30 minutes below the max,
 * and the clock moves forward by whole steps only so partial time is kept.
 */
export function refillLives(state: MockState, now: number): MockState {
  if (state.lives >= MAX_LIVES) return state;
  const earned = Math.floor((now - state.livesUpdatedAt) / LIFE_REFILL_MS);
  if (earned <= 0) return state;
  const lives = Math.min(MAX_LIVES, state.lives + earned);
  return { ...state, lives, livesUpdatedAt: state.livesUpdatedAt + earned * LIFE_REFILL_MS };
}

function playerStats(state: MockState): PlayerStats {
  let level = 1;
  let rest = state.xp;
  while (rest >= xpForPlayerLevel(level)) {
    rest -= xpForPlayerLevel(level);
    level += 1;
  }
  return {
    lives: state.lives,
    maxLives: MAX_LIVES,
    nextLifeAt: state.lives >= MAX_LIVES ? null : state.livesUpdatedAt + LIFE_REFILL_MS,
    xp: state.xp,
    playerLevel: level,
    xpIntoLevel: rest,
    xpForNext: xpForPlayerLevel(level),
  };
}

function frontierOf(state: MockState): number {
  let highest = 0;
  for (const key of Object.keys(state.progress)) highest = Math.max(highest, Number(key));
  return Math.min(SEASON_LENGTH, highest + 1);
}

export function mockLevelNode(level: number, progress?: StoredProgress): LevelNode {
  return {
    ...season1Catalog().level(level),
    stars: progress?.stars ?? 0,
    bestMs: progress?.bestMs ?? null,
  };
}

export interface MockClientOptions {
  /** The signed-in account; each account keeps its own progress. */
  accountId?: string;
  now?: () => number;
  load?: () => string | null;
  save?: (raw: string) => void;
  /** Simulated network delay, ms. */
  latencyMs?: number;
}

function localLoad(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSave(key: string, raw: string): void {
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* private mode / quota: progress lives for this session only */
  }
}

export function createMockLevelsClient(opts: MockClientOptions = {}): LevelsClient {
  const now = opts.now ?? Date.now;
  // One store per account, so a second account on the device starts fresh.
  const key = `${STORAGE_PREFIX}:${opts.accountId ?? "anon"}`;
  const load = opts.load ?? (() => localLoad(key));
  const save = opts.save ?? ((raw: string) => localSave(key, raw));
  const latency = opts.latencyMs ?? 0;
  let memory: MockState | null = null;
  let ticketCounter = 0;

  const read = (): MockState => {
    const t = now();
    const base = memory ?? parseMockState(load()) ?? freshState(t);
    memory = refillLives(base, t);
    return memory;
  };
  const write = (next: MockState) => {
    memory = next;
    save(JSON.stringify(next));
  };
  const wait = <T,>(value: T): Promise<T> =>
    latency > 0 ? new Promise((r) => setTimeout(() => r(value), latency)) : Promise.resolve(value);

  return {
    getSeason(): Promise<SeasonView> {
      const state = read();
      const levels: LevelNode[] = [];
      for (let n = 1; n <= SEASON_LENGTH; n++) levels.push(mockLevelNode(n, state.progress[String(n)]));
      const frontier = frontierOf(state);
      const fails = failsAt(state.fails ?? null, 1, frontier);
      return wait({
        season: 1,
        name: "Season 1",
        levels,
        frontier,
        player: playerStats(state),
        streak: state.streak,
        nextStartPowerUp: freeStartPowerUp({
          atFrontier: true,
          streak: state.streak,
          fails,
          allowed: boosterTypesOf(levels[frontier - 1].allowedPowerUps),
        }),
        stuck: { level: frontier, fails, routeGhostAvailable: false },
        boosters: { ...(state.boosters ?? {}) },
        chests: mockChestProgress(state),
        // Gems are server-only: the mock never offers a paid refill.
        refill: null,
      });
    },

    startLevel(level: number, opts: StartOptions = {}): Promise<StartResult> {
      const state = read();
      if (!Number.isInteger(level) || level < 1 || level > frontierOf(state)) {
        return wait({ ok: false, code: "LOCKED" });
      }
      const node = mockLevelNode(level);
      let next = state;
      // An open ticket at the frontier is a loss (§6.3).
      if (state.openTicket) {
        const openAtFrontier = state.openTicket.level === frontierOf(state);
        next = {
          ...next,
          streak: nextStreak(next.streak, "abandoned", openAtFrontier),
          fails: nextFailTally(next.fails ?? null, { season: 1, level: state.openTicket.level }, "abandoned", openAtFrontier),
        };
      }
      const atFrontier = level === frontierOf(state);
      const startPowerUp = freeStartPowerUp({
        atFrontier,
        streak: next.streak,
        fails: atFrontier ? failsAt(next.fails ?? null, 1, level) : 0,
        allowed: boosterTypesOf(node.allowedPowerUps),
      });
      // An owned booster unlocked here (§6.4). A free power-up wins and the
      // booster is kept, as on the server.
      const requested = opts.booster ?? null;
      const owned = requested !== null ? (state.boosters?.[requested] ?? 0) : 0;
      if (requested !== null && (owned < 1 || !boosterTypesOf(node.allowedPowerUps).includes(requested))) {
        return wait({ ok: false, code: "BOOSTER_UNAVAILABLE" });
      }
      const booster = startPowerUp === null ? requested : null;
      if (node.costsLife) {
        if (state.lives <= 0) return wait({ ok: false, code: "OUT_OF_LIVES", player: playerStats(state) });
        // Spending from full starts the refill clock now (§5b).
        next = {
          ...next,
          lives: state.lives - 1,
          livesUpdatedAt: state.lives >= MAX_LIVES ? now() : state.livesUpdatedAt,
        };
      }
      ticketCounter += 1;
      const id = `mock-${now()}-${ticketCounter}`;
      next = { ...next, openTicket: { id, level } };
      if (booster !== null) {
        const boosters = { ...(next.boosters ?? {}) };
        const left = owned - 1;
        if (left > 0) boosters[booster] = left;
        else delete boosters[booster];
        next = { ...next, boosters };
      }
      write(next);
      return wait({
        ok: true,
        ticket: {
          id,
          level,
          seed: node.seed,
          goalFt: node.goalFt,
          pars: node.pars,
          player: playerStats(next),
          startPowerUp: booster !== null ? { type: booster, source: "booster" } : startPowerUp,
        },
      });
    },

    getBoard(level: number): Promise<LevelBoardView> {
      // No friends on the device: the board is the player's own best.
      const mine = read().progress[String(level)];
      return wait({
        level,
        friendCount: 0,
        entries: mine ? [{ rank: 1, isMe: true, handle: "You", stars: mine.stars, timeMs: mine.bestMs }] : [],
      });
    },

    submitResult(ticketId: string, run: LevelRunReport): Promise<LevelResult> {
      const state = read();
      const ticket = state.openTicket;
      if (!ticket || ticket.id !== ticketId) {
        return Promise.reject(new Error("Unknown or used ticket"));
      }
      const node = mockLevelNode(ticket.level);
      const prev = state.progress[String(ticket.level)];
      const previousStars: StarCount = prev?.stars ?? 0;
      const cleared = run.finished && run.finishedTick !== null;
      const timeMs = cleared ? Math.round(((run.finishedTick as number) / TICK_HZ) * 1000) : null;
      const stars: StarCount = timeMs !== null ? starsForTime(timeMs, node.pars) : 0;

      let xpGained = 0;
      if (cleared && !prev) xpGained += (50 + 5 * ticket.level) * (isHardLevel(ticket.level) ? 2 : 1);
      if (stars > previousStars) xpGained += 25 * (stars - previousStars);
      // Levels clear in order, so the first clear of an episode's last level
      // completes the episode (§5a).
      if (cleared && !prev && ticket.level % EPISODE_SIZE === 0) xpGained += 250;

      const before = playerStats(state).playerLevel;
      const atFrontier = ticket.level === frontierOf(state);
      const outcome = cleared ? "cleared" : "failed";
      const streak = nextStreak(state.streak, outcome, atFrontier);
      const fails = nextFailTally(state.fails ?? null, { season: 1, level: ticket.level }, outcome, atFrontier);
      const progress = { ...state.progress };
      if (cleared && timeMs !== null) {
        progress[String(ticket.level)] = {
          stars: Math.max(stars, previousStars) as StarCount,
          bestMs: prev ? Math.min(prev.bestMs, timeMs) : timeMs,
        };
      }
      // A clear refunds the life it cost (§5b).
      const refund = cleared && node.costsLife ? 1 : 0;
      let next: MockState = {
        ...state,
        progress,
        xp: state.xp + xpGained,
        lives: Math.min(MAX_LIVES, state.lives + refund),
        openTicket: null,
        streak,
        fails,
      };
      const chestsOpened: OpenedChest[] = [];
      if (cleared) next = openMockChests(next, key, chestsOpened);
      write(next);
      const player = playerStats(next);
      return wait({
        level: ticket.level,
        cleared,
        stars,
        previousStars,
        timeMs,
        outOfTime: !cleared && run.outOfTime,
        pars: node.pars,
        goalFt: node.goalFt,
        peakFt: run.peakFt,
        xpGained,
        newPlayerLevel: player.playerLevel > before ? player.playerLevel : null,
        player,
        // Guest stars live on the device and unlock nothing on the server.
        unlockedAvatars: [],
        streak,
        atFrontier,
        failsAtLevel: atFrontier ? failsAt(fails, 1, ticket.level) : 0,
        routeGhostAvailable: false,
        chestsOpened,
        boosters: { ...(next.boosters ?? {}) },
      });
    },
  };
}

function mockChestProgress(state: MockState) {
  const lifetimeStars = lifetimeStarsOf(state);
  const { starsIntoChest, perChest } = chestProgress(lifetimeStars);
  return { lifetimeStars, starsIntoChest, perChest };
}

/**
 * Open every earned chest (as the server does on a clear), drawing from the
 * boosters unlocked at the highest cleared level. With none unlocked yet the
 * chests stay earned and open on a later clear. Pushes each onto `opened`.
 */
function openMockChests(state: MockState, accountKey: string, opened: OpenedChest[]): MockState {
  const earned = chestsEarned(lifetimeStarsOf(state));
  let done = state.chestsOpened ?? 0;
  if (earned <= done) return state;
  const pool = boosterTypesOf(mockLevelNode(Math.max(1, frontierOf(state) - 1)).allowedPowerUps);
  if (pool.length === 0) return state;
  const boosters: BoosterInventory = { ...(state.boosters ?? {}) };
  while (done < earned) {
    done += 1;
    const contents = chestBoostersFromRoll(mockChestRoll(accountKey, done), pool);
    for (const type of contents) boosters[type] = (boosters[type] ?? 0) + 1;
    opened.push({ chestNumber: done, boosters: contents });
  }
  return { ...state, boosters, chestsOpened: done };
}
