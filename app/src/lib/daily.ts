/**
 * Daily Climb — the return hook. Everyone gets the *same* tower each calendar
 * day (the server's seed from GET /api/climb/daily, fed to useClimb's seed
 * lock; only the server can derive it), and we track a local streak + per-day
 * best so there's a reason to come back tomorrow.
 *
 * The day is the UTC calendar day (src/lib/dailyDay.ts), the same day the
 * server uses for the daily board, so every player shares one tower and one
 * reset. Streak + per-day best stay client-side and offline-safe in
 * localStorage; the verified score lives on the server's daily board.
 *
 * Stores written before the UTC switch hold LOCAL-date keys. They carry no
 * `scheme` marker and are migrated once on read (migrateLocalDayKeys). A
 * player far from UTC can lose at most one streak day in the switch.
 *
 * The one store for both surfaces: the web /daily page imports it directly and
 * the Capacitor app imports it as "@app/lib/daily" (RV-DC-4), so the storage
 * scheme and its migration can never drift apart. Because the ES2020 WebView
 * SPA imports it, it must stay ES2020-safe: no Object.hasOwn, no .at().
 */
import {
  migrateLocalDayKeys,
  msUntilUtcReset,
  shiftDayKey,
  utcDayKey,
} from "./dailyDay";

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

/**
 * A fresh empty store. A factory, not a shared constant: a spread copy of a
 * constant would share its `best` object, so one run's write would leak into
 * every later empty store (e.g. the next account after clearDailyStore, or
 * after the stored blob is removed or corrupt).
 */
function emptyStore(): DailyStore {
  return { scheme: UTC_SCHEME, lastPlayedKey: null, streak: 0, best: {} };
}

/** Today's UTC day key — the day the server's daily board uses. */
export function todayKey(): string {
  return utcDayKey(new Date());
}

/** The previous day, from the same reference day so a call that straddles
 *  the reset can't mix two different days. */
function yesterdayOf(today: string): string {
  return shiftDayKey(today, -1);
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

const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * formatReset for a screen reader: "6 hours 36 minutes" / "48 minutes" /
 * "less than a minute". "6h 36m" reads as letters on some voices.
 */
export function spokenReset(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${unit(h, "hour", "hours")} ${unit(m, "minute", "minutes")}`;
  if (m > 0) return unit(m, "minute", "minutes");
  return "less than a minute";
}

function read(): DailyStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
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
    return emptyStore();
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

/** One cell of the streak strip — the current UTC week, Sunday → Saturday. */
export interface DailyWeekDay {
  /** UTC calendar day key, "YYYY-MM-DD". */
  key: string;
  /** Single-letter strip label (duplicates across the week by design). */
  label: string;
  /** Full weekday name — the accessible label, never truncated. */
  weekday: string;
  /** True when this day's climb was recorded on this device. */
  played: boolean;
  isToday: boolean;
  /** Later this week — rendered inert, never as a missed day. */
  isFuture: boolean;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * The current week's streak cells. Pure and total: always 7 entries in
 * Sunday→Saturday order for the week containing `now`, exactly one `isToday`,
 * and no reads or writes of its own.
 *
 * A day counts as played when it has a recorded best OR is the last played
 * day — a run that never beat 0 still stores `lastPlayedKey` but no best.
 * Days pruned by the store's retention window simply read `played: false`.
 */
export function computeWeekDays(
  best: Record<string, number>,
  lastPlayedKey: string | null,
  now: Date
): DailyWeekDay[] {
  const todayStr = utcDayKey(now);
  // UTC week, matching the UTC day keys the store records.
  const sunday = shiftDayKey(todayStr, -new Date(now.getTime()).getUTCDay());

  return WEEKDAYS.map((weekday, i) => {
    const key = shiftDayKey(sunday, i);
    return {
      key,
      label: weekday.charAt(0),
      weekday,
      // hasOwnProperty.call, not Object.hasOwn: the SPA targets ES2020 WebViews.
      played: Object.prototype.hasOwnProperty.call(best, key) || lastPlayedKey === key,
      isToday: key === todayStr,
      isFuture: key > todayStr,
    };
  });
}

/** The current week's streak cells for this device. Client-only (localStorage). */
export function dailyWeek(): DailyWeekDay[] {
  const store = read();
  return computeWeekDays(store.best, store.lastPlayedKey, new Date());
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
