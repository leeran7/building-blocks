import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CreatorPlatform } from "@prisma/client";
import { apiFetch } from "../lib/api";
import { useAuth } from "./AuthContext";
import { setLeaderboardConsent } from "../lib/consent";

/**
 * In-memory data cache for the read-heavy hub screens (You / Ranks).
 *
 * Each screen used to fetch on every mount, flashing a skeleton and — for the
 * shared `/api/settings` record — fetching the same data twice across the old
 * Profile and Settings screens. This provider fetches each source once, caches
 * it, and serves it instantly on revisit with a background stale-while-
 * revalidate refresh. Mirrors the AuthContext pattern; lives inside AuthProvider
 * so it can read the Bearer token and clear itself when the account changes.
 */

export type SocialState = Partial<Record<CreatorPlatform, string>>;

export interface DashboardData {
  user: { id: string; email: string; username: string | null };
  freeClimb: {
    peakY: number;
    rank: number;
    totalClimbers: number;
    wins: number;
    handle: string;
  } | null;
}

export interface SettingsData {
  displayName: string | null;
  username: string | null;
  social: SocialState | null;
  urls: string[] | null;
  leaderboardConsent: boolean;
}

export interface ClimberRank {
  rank: number;
  userId: string;
  handle: string;
  username: string | null;
  peakY: number;
  wins: number;
}

interface Slice<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  fetchedAt: number | null;
}

const EMPTY_SLICE = { data: null, loading: false, error: false, fetchedAt: null };

/** Background revalidate window — cached data older than this refetches silently. */
const TTL_MS = 30_000;

interface AppDataState {
  dashboard: Slice<DashboardData>;
  settings: Slice<SettingsData>;
  leaderboard: Slice<ClimberRank[]>;
  ensureDashboard: () => void;
  ensureSettings: () => void;
  ensureLeaderboard: () => void;
  refreshSettings: () => Promise<void>;
  /** Optimistically update the cached settings after a successful save. */
  setSettings: (next: SettingsData) => void;
  /**
   * Mark the given slices stale (keeping any cached data for a stale-while-
   * revalidate paint) so the next screen that reads them refetches immediately —
   * e.g. after a climb run changes your standing and the leaderboard.
   */
  invalidate: (keys: Array<"dashboard" | "settings" | "leaderboard">) => void;
  /** Drop all cached data (sign-out, account delete, account switch). */
  clearAll: () => void;
}

const Ctx = createContext<AppDataState | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, isAnonymous } = useAuth();
  const [dashboard, setDashboard] = useState<Slice<DashboardData>>(EMPTY_SLICE);
  const [settings, setSettingsSlice] = useState<Slice<SettingsData>>(EMPTY_SLICE);
  const [leaderboard, setLeaderboard] = useState<Slice<ClimberRank[]>>(EMPTY_SLICE);

  // Guards against overlapping in-flight fetches per slice.
  const inflight = useRef({ dashboard: false, settings: false, leaderboard: false });

  const clearAll = useCallback(() => {
    setDashboard(EMPTY_SLICE);
    setSettingsSlice(EMPTY_SLICE);
    setLeaderboard(EMPTY_SLICE);
    inflight.current = { dashboard: false, settings: false, leaderboard: false };
  }, []);

  // Wipe the cache the instant the signed-in account changes (incl. sign-out).
  // Done as a set-state-during-render reset — NOT a useEffect — so the cleared
  // slices are committed before any consumer screen renders in this same pass;
  // an effect is eventual and would let the previous account's data show for a
  // frame. Covers every path (Sign Out button, delete, silent Firebase re-auth).
  const uid = user?.uid ?? null;
  const prevUid = useRef<string | null>(uid);
  if (prevUid.current !== uid) {
    prevUid.current = uid;
    setDashboard(EMPTY_SLICE);
    setSettingsSlice(EMPTY_SLICE);
    setLeaderboard(EMPTY_SLICE);
    inflight.current = { dashboard: false, settings: false, leaderboard: false };
  }

  const authed = Boolean(user) && !isAnonymous;

  // Generic loader: skeleton only on a cold slice; warm slices refresh silently.
  const load = useCallback(
    async <T,>(
      key: "dashboard" | "settings" | "leaderboard",
      slice: Slice<T>,
      set: (s: Slice<T>) => void,
      fetcher: () => Promise<T | null>,
    ) => {
      if (inflight.current[key]) return;
      inflight.current[key] = true;
      const cold = slice.data === null;
      if (cold) set({ ...slice, loading: true, error: false });
      try {
        const data = await fetcher();
        if (data === null) {
          // Failed fetch: keep any prior data (mark error only when cold), and
          // stamp fetchedAt so the TTL throttles retries into a backoff instead
          // of hammering the endpoint every render while it's down.
          set({ data: slice.data, loading: false, error: slice.data === null, fetchedAt: Date.now() });
        } else {
          set({ data, loading: false, error: false, fetchedAt: Date.now() });
        }
      } catch {
        set({ ...slice, loading: false, error: cold, fetchedAt: Date.now() });
      } finally {
        inflight.current[key] = false;
      }
    },
    [],
  );

  const isStale = (slice: Slice<unknown>) =>
    slice.fetchedAt === null || Date.now() - slice.fetchedAt > TTL_MS;

  const ensureDashboard = useCallback(() => {
    if (!authed) return;
    // Gate on staleness only — a failed fetch stamps fetchedAt, so the TTL backs
    // off retries. Gating on `error` here would refetch every render (no data
    // means each failure yields a new slice identity → effect re-fires → loop).
    if (!isStale(dashboard)) return;
    void load("dashboard", dashboard, setDashboard, () =>
      apiFetch("/api/dashboard").then((r) => (r.ok ? (r.json() as Promise<DashboardData>) : null)).catch(() => null),
    );
  }, [authed, dashboard, load]);

  const ensureSettings = useCallback(() => {
    if (!authed) return;
    if (!isStale(settings)) return;
    void load("settings", settings, setSettingsSlice, () =>
      apiFetch("/api/settings")
        .then((r) => (r.ok ? (r.json() as Promise<SettingsData & { leaderboardConsent?: boolean }>) : null))
        .then((d) => {
          if (!d) return null;
          const consent = Boolean(d.leaderboardConsent);
          setLeaderboardConsent(consent);
          return {
            displayName: d.displayName ?? null,
            username: d.username ?? null,
            social: d.social && typeof d.social === "object" ? d.social : null,
            urls: Array.isArray(d.urls) ? d.urls : null,
            leaderboardConsent: consent,
          };
        })
        .catch(() => null),
    );
  }, [authed, settings, load]);

  const ensureLeaderboard = useCallback(() => {
    if (!authed) return;
    if (!isStale(leaderboard)) return;
    void load("leaderboard", leaderboard, setLeaderboard, () =>
      apiFetch("/api/climb/leaderboard")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d ? (d.climbers ?? []) : null))
        .catch(() => null),
    );
  }, [authed, leaderboard, load]);

  const refreshSettings = useCallback(async () => {
    await load("settings", { ...settings, fetchedAt: null }, setSettingsSlice, () =>
      apiFetch("/api/settings")
        .then((r) => (r.ok ? (r.json() as Promise<SettingsData>) : null))
        .catch(() => null),
    );
  }, [settings, load]);

  const setSettings = useCallback((next: SettingsData) => {
    setSettingsSlice({ data: next, loading: false, error: false, fetchedAt: Date.now() });
  }, []);

  const invalidate = useCallback(
    (keys: Array<"dashboard" | "settings" | "leaderboard">) => {
      const markStale = <T,>(s: Slice<T>): Slice<T> => ({ ...s, fetchedAt: null });
      if (keys.includes("dashboard")) setDashboard(markStale);
      if (keys.includes("settings")) setSettingsSlice(markStale);
      if (keys.includes("leaderboard")) setLeaderboard(markStale);
    },
    [],
  );

  const value = useMemo<AppDataState>(
    () => ({
      dashboard,
      settings,
      leaderboard,
      ensureDashboard,
      ensureSettings,
      ensureLeaderboard,
      refreshSettings,
      setSettings,
      invalidate,
      clearAll,
    }),
    [
      dashboard,
      settings,
      leaderboard,
      ensureDashboard,
      ensureSettings,
      ensureLeaderboard,
      refreshSettings,
      setSettings,
      invalidate,
      clearAll,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useAppData(): AppDataState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

/** Cached dashboard slice; fetches on mount if cold, revalidates if stale. */
export function useDashboard() {
  const { dashboard, ensureDashboard } = useAppData();
  useEffect(() => {
    ensureDashboard();
  }, [ensureDashboard]);
  return dashboard;
}

/**
 * Warm the whole hub cache from the landing (Home) screen: dashboard, settings
 * and leaderboard all fetch on mount so navigating to Profile / Ranks is instant
 * on the first visit, not just on revisit. Returns the dashboard slice since
 * Home already renders the player's standing from it (and this dedupes what was
 * a separate Home /api/dashboard fetch).
 */
export function useHubPrefetch() {
  const { dashboard, ensureDashboard, ensureSettings, ensureLeaderboard } = useAppData();
  useEffect(() => {
    ensureDashboard();
    ensureSettings();
    ensureLeaderboard();
  }, [ensureDashboard, ensureSettings, ensureLeaderboard]);
  return dashboard;
}

/** Cached settings slice + mutators for the You page save/refresh. */
export function useSettings() {
  const { settings, ensureSettings, refreshSettings, setSettings } = useAppData();
  useEffect(() => {
    ensureSettings();
  }, [ensureSettings]);
  return { ...settings, refreshSettings, setSettings };
}

/** Cached leaderboard slice; fetches on mount if cold, revalidates if stale. */
export function useLeaderboard() {
  const { leaderboard, ensureLeaderboard } = useAppData();
  useEffect(() => {
    ensureLeaderboard();
  }, [ensureLeaderboard]);
  return leaderboard;
}

/** Escape hatch for the auth flow to drop cache on sign-out / delete. */
export function useClearAppData() {
  return useAppData().clearAll;
}

/**
 * Mark cached slices stale so the next screen that reads them refetches. Call
 * after a climb run so the leaderboard + standing reflect the new score the
 * moment the player returns to Ranks / Profile, instead of within the TTL.
 */
export function useInvalidateAppData() {
  return useAppData().invalidate;
}
