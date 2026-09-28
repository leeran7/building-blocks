import { TICK_HZ } from "@app/game/types";
import { season1Catalog } from "./catalog";
import {
  EPISODE_SIZE,
  isHardLevel,
  starsForTime,
  type LevelNode,
  type LevelResult,
  type LevelRunReport,
  type LevelsClient,
  type PlayerStats,
  type SeasonView,
  type StarCount,
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
}

function freshState(now: number): MockState {
  return { progress: {}, lives: MAX_LIVES, livesUpdatedAt: now, xp: 0, openTicket: null };
}

function isStarCount(v: unknown): v is StarCount {
  return v === 0 || v === 1 || v === 2 || v === 3;
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
  };
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
      return wait({
        season: 1,
        name: "Season 1",
        levels,
        frontier: frontierOf(state),
        player: playerStats(state),
      });
    },

    startLevel(level: number): Promise<StartResult> {
      const state = read();
      if (!Number.isInteger(level) || level < 1 || level > frontierOf(state)) {
        return wait({ ok: false, code: "LOCKED" });
      }
      const node = mockLevelNode(level);
      let next = state;
      if (node.costsLife) {
        if (state.lives <= 0) return wait({ ok: false, code: "OUT_OF_LIVES", player: playerStats(state) });
        // Spending from full starts the refill clock now (§5b).
        next = {
          ...state,
          lives: state.lives - 1,
          livesUpdatedAt: state.lives >= MAX_LIVES ? now() : state.livesUpdatedAt,
        };
      }
      ticketCounter += 1;
      const id = `mock-${now()}-${ticketCounter}`;
      next = { ...next, openTicket: { id, level } };
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
        },
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
      const progress = { ...state.progress };
      if (cleared && timeMs !== null) {
        progress[String(ticket.level)] = {
          stars: Math.max(stars, previousStars) as StarCount,
          bestMs: prev ? Math.min(prev.bestMs, timeMs) : timeMs,
        };
      }
      // A clear refunds the life it cost (§5b).
      const refund = cleared && node.costsLife ? 1 : 0;
      const next: MockState = {
        ...state,
        progress,
        xp: state.xp + xpGained,
        lives: Math.min(MAX_LIVES, state.lives + refund),
        openTicket: null,
      };
      write(next);
      const player = playerStats(next);
      return wait({
        level: ticket.level,
        cleared,
        stars,
        previousStars,
        timeMs,
        pars: node.pars,
        goalFt: node.goalFt,
        peakFt: run.peakFt,
        xpGained,
        newPlayerLevel: player.playerLevel > before ? player.playerLevel : null,
        player,
        // Guest stars live on the device and unlock nothing on the server.
        unlockedAvatars: [],
      });
    },
  };
}
