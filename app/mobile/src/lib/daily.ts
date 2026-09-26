/**
 * Daily Climb — the return hook. Everyone gets the *same* tower each calendar
 * day (a deterministic seed fed to useClimb's seed lock), and we track a local
 * streak + per-day best so there's a reason to come back tomorrow.
 *
 * The day is the UTC calendar day (src/lib/dailyDay.ts), the same day the
 * server uses for the daily board, so every player shares one tower and one
 * reset. Streak + per-day best stay client-side and offline-safe in
 * localStorage; the verified score lives on the server's daily board.
 *
 * Stores written before the UTC switch hold LOCAL-date keys. They carry no
 * `scheme` marker and are migrated once on read (migrateLocalDayKeys). A
 * player far from UTC can lose at most one streak day in the switch.
 */
import {
  dailySeedFor,
  migrateLocalDayKeys,
  msUntilUtcReset,
  shiftDayKey,
  utcDayKey,
} from "@app/lib/dailyDay";

const STORE_KEY = "doomstack.daily.v1";
/** Marks a store whose keys are UTC days. Absent = legacy local-date keys. */
const UTC_SCHEME = "utc";
const KEEP_DAYS = 14;

interface DailyStore {
  scheme: typeof UTC_SCHEME;
  lastPlayedKey: string | null;
  streak: number;
  best: Record<string, number>;
}

const empty: DailyStore = { scheme: UTC_SCHEME, lastPlayedKey: null, streak: 0, best: {} };

/** Today's UTC day key — the day the server's daily board uses. */
export function todayKey(): string {
  return utcDayKey(new Date());
}

/** The previous day, from the same reference day so a call that straddles
 *  the reset can't mix two different days. */
function yesterdayOf(today: string): string {
  return shiftDayKey(today, -1);
}

/** The tower seed for today — identical for every player, changes at 00:00 UTC.
 *  Offline fallback only: online clients use the server's seed (GET /api/climb/daily). */
export function dailySeed(): string {
  return dailySeedFor(todayKey());
}

/** Milliseconds until the next 00:00 UTC reset. */
export function msUntilReset(): number {
  return msUntilUtcReset(new Date());
}

/** Human "4h 12m" / "48m" / "<1m" until reset. */
export function formatReset(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function read(): DailyStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw) as Partial<Omit<DailyStore, "scheme">> & { scheme?: unknown };
    // Coerce untrusted localStorage: keep only finite, non-negative day-bests
    // and a sane streak so a hand-edited blob can't poison display/logic.
    const best: Record<string, number> = {};
    if (parsed.best && typeof parsed.best === "object") {
      for (const [k, v] of Object.entries(parsed.best)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) best[k] = v;
      }
    }
    const streak =
      typeof parsed.streak === "number" && Number.isFinite(parsed.streak)
        ? Math.max(0, Math.floor(parsed.streak))
        : 0;
    const lastPlayedKey =
      typeof parsed.lastPlayedKey === "string" ? parsed.lastPlayedKey : null;
    if (parsed.scheme === UTC_SCHEME) {
      return { scheme: UTC_SCHEME, lastPlayedKey, streak, best };
    }
    // Legacy local-date store: migrate once and persist so it never re-runs.
    const migrated = migrateLocalDayKeys(lastPlayedKey, best, todayKey());
    const store: DailyStore = { scheme: UTC_SCHEME, streak, ...migrated };
    write(store);
    return store;
  } catch {
    return { ...empty };
  }
}

function write(store: DailyStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — daily degrades to non-persistent, that's fine */
  }
}

/**
 * Wipe the local daily state (streak + per-day bests). The store is device-local
 * and not keyed by account, so it must be cleared on account deletion — otherwise
 * a new account created on the same phone inherits the previous user's streak.
 */
export function clearDailyStore(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

export interface DailySummary {
  /** Consecutive-day streak, or 0 if the chain is already broken. */
  streak: number;
  /** Best height on today's tower (0 if not played today). */
  todayBest: number;
  /** Whether today's daily has been played at all. */
  playedToday: boolean;
}

/** Non-mutating snapshot for display (home card, lobby). */
export function dailySummary(): DailySummary {
  const store = read();
  const today = todayKey();
  const yesterday = yesterdayOf(today);
  const playedToday = store.lastPlayedKey === today;
  // A streak only still counts if the last play was today or yesterday.
  const chainAlive =
    store.lastPlayedKey === today || store.lastPlayedKey === yesterday;
  return {
    streak: chainAlive ? store.streak : 0,
    todayBest: store.best[today] ?? 0,
    playedToday,
  };
}

export interface DailyRunResult {
  streak: number;
  todayBest: number;
  /** True if this run beat the player's own best on today's tower. */
  isDayBest: boolean;
  /** True if this run extended the streak to a new day. */
  streakExtended: boolean;
}

/**
 * Record a finished daily run; updates streak + that day's best. `day` is the
 * UTC day of the tower actually played (a run that straddles the reset still
 * belongs to the day it started on); defaults to today.
 */
export function commitDailyRun(peakY: number, day: string = todayKey()): DailyRunResult {
  const store = read();
  const today = day;
  const yesterday = yesterdayOf(today);
  const prevBest = store.best[today] ?? 0;
  const isDayBest = peakY > prevBest;
  if (isDayBest) store.best[today] = peakY;

  let streakExtended = false;
  const last = store.lastPlayedKey;
  if (last !== null && last >= today) {
    // Already played this day — or a later one, when a run that straddled
    // the reset lands after today's — so the streak stands.
  } else if (last === yesterday) {
    store.streak += 1;
    streakExtended = true;
  } else {
    store.streak = 1;
    streakExtended = true;
  }
  if (last === null || last < today) store.lastPlayedKey = today;

  // Prune old day-bests so the blob stays tiny.
  const keys = Object.keys(store.best).sort();
  while (keys.length > KEEP_DAYS) {
    const drop = keys.shift();
    if (drop) delete store.best[drop];
  }

  write(store);
  return {
    streak: store.streak,
    todayBest: store.best[today] ?? peakY,
    isDayBest,
    streakExtended,
  };
}
