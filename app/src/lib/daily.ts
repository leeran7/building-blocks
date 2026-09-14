/**
 * Daily Climb — the return hook. Everyone gets the *same* tower each calendar
 * day (a deterministic seed fed to useClimb's seed lock), and we track a local
 * streak + per-day best so there's a reason to come back tomorrow.
 *
 * Fully client-side and offline-safe: state lives in localStorage, keyed by the
 * device's local date. No backend changes required — daily runs still post to
 * the global leaderboard like any other climb.
 *
 * Ported verbatim from the native app (app/mobile/src/lib/daily.ts); the two
 * surfaces intentionally share the same STORE_KEY + seed scheme.
 */
const STORE_KEY = "doomstack.daily.v1";
const KEEP_DAYS = 14;

interface DailyStore {
  lastPlayedKey: string | null;
  streak: number;
  best: Record<string, number>;
}

const empty: DailyStore = { lastPlayedKey: null, streak: 0, best: {} };

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** Today + yesterday keys derived from a single Date, so a call that straddles
 *  local midnight can't mix two different reference days. */
function dayKeys(now: Date): { today: string; yesterday: string } {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return { today: dateKey(now), yesterday: dateKey(y) };
}

/** The tower seed for today — identical for every player, changes at midnight. */
export function dailySeed(): string {
  return `daily-${todayKey()}`;
}

/** Milliseconds until the local next-midnight reset. */
export function msUntilReset(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
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
    const parsed = JSON.parse(raw) as Partial<DailyStore>;
    // Coerce untrusted localStorage: keep only finite, non-negative day-bests
    // and a sane streak so a hand-edited blob can't poison display/logic.
    const best: Record<string, number> = {};
    if (parsed.best && typeof parsed.best === "object") {
      for (const [k, v] of Object.entries(parsed.best)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) best[k] = v;
      }
    }
    return {
      lastPlayedKey:
        typeof parsed.lastPlayedKey === "string" ? parsed.lastPlayedKey : null,
      streak:
        typeof parsed.streak === "number" && Number.isFinite(parsed.streak)
          ? Math.max(0, Math.floor(parsed.streak))
          : 0,
      best,
    };
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
  const { today, yesterday } = dayKeys(new Date());
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

/** Record a finished daily run; updates streak + today's best. */
export function commitDailyRun(peakY: number): DailyRunResult {
  const store = read();
  const { today, yesterday } = dayKeys(new Date());
  const prevBest = store.best[today] ?? 0;
  const isDayBest = peakY > prevBest;
  if (isDayBest) store.best[today] = peakY;

  let streakExtended = false;
  if (store.lastPlayedKey === today) {
    // Already played today — streak stands.
  } else if (store.lastPlayedKey === yesterday) {
    store.streak += 1;
    streakExtended = true;
  } else {
    store.streak = 1;
    streakExtended = true;
  }
  store.lastPlayedKey = today;

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
