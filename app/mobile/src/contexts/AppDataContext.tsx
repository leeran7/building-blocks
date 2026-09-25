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
import { parseFriendsBoard } from "../lib/leaderboard";
import { parseAvatarId } from "@app/lib/avatars";

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
  leaderboardConsent: boolean;
  /** Catalogue avatar id; null = initials badge. */
  avatarId: string | null;
}

/** Normalises a GET/PUT /api/settings body into the cached settings shape. */
export function settingsFromResponse(body: unknown): SettingsData | null {
  if (typeof body !== "object" || body === null) return null;
  const d = body as Record<string, unknown>;
  return {
    displayName: typeof d.displayName === "string" ? d.displayName : null,
    username: typeof d.username === "string" ? d.username : null,
    social: d.social && typeof d.social === "object" ? (d.social as SocialState) : null,
    leaderboardConsent: Boolean(d.leaderboardConsent),
    avatarId: parseAvatarId(d.avatarId),
  };
}

export interface ClimberRank {
  rank: number;
  userId: string;
  handle: string;
  username: string | null;
  peakY: number;
  wins: number;
  avatarId: string | null;
}

export interface FriendsBoard {
  climbers: ClimberRank[];
  hiddenCount: number;
  notClimbedCount: number;
}

type SliceKey = "dashboard" | "settings" | "leaderboard" | "friendsLeaderboard";

const IDLE_INFLIGHT: Record<SliceKey, boolean> = {
  dashboard: false,
  settings: false,
  leaderboard: false,
  friendsLeaderboard: false,
};

interface Slice<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  fetchedAt: number | null;
}

const EMPTY_SLICE = { data: null, loading: false, error: false, fetchedAt: null };

const NEVER_SETTLED: Record<SliceKey, number | null> = {
  dashboard: null,
  settings: null,
  leaderboard: null,
  friendsLeaderboard: null,
};

/** Background revalidate window — cached data older than this refetches silently. */
const TTL_MS = 30_000;

interface AppDataState {
  dashboard: Slice<DashboardData>;
  settings: Slice<SettingsData>;
  leaderboard: Slice<ClimberRank[]>;
  friendsLeaderboard: Slice<FriendsBoard>;
  ensureDashboard: () => void;
  ensureSettings: () => void;
  ensureLeaderboard: () => void;
  refreshLeaderboard: () => Promise<void>;
  ensureFriendsLeaderboard: () => void;
  refreshFriendsLeaderboard: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  /** Optimistically update the cached settings after a successful save. */
  setSettings: (next: SettingsData) => void;
  /**
   * Mark the given slices stale (keeping any cached data for a stale-while-
   * revalidate paint) so the next screen that reads them refetches immediately —
   * e.g. after a climb run changes your standing and the leaderboard.
   */
  invalidate: (keys: SliceKey[]) => void;
  /** Drop all cached data (sign-out, account delete, account switch). */
  clearAll: () => void;
}

const Ctx = createContext<AppDataState | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, isAnonymous } = useAuth();
  const [dashboard, setDashboard] = useState<Slice<DashboardData>>(EMPTY_SLICE);
  const [settings, setSettingsSlice] = useState<Slice<SettingsData>>(EMPTY_SLICE);
  const [leaderboard, setLeaderboard] = useState<Slice<ClimberRank[]>>(EMPTY_SLICE);
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<Slice<FriendsBoard>>(EMPTY_SLICE);

  // Guards against overlapping in-flight fetches per slice.
  const inflight = useRef<Record<SliceKey, boolean>>({ ...IDLE_INFLIGHT });
  // When each slice's last fetch settled (success or failure); null = refetch
  // on the next ensure. The ensure* staleness check reads this, not the slice
  // state: a fast failure can settle (and clear `inflight`) between a commit
  // and that commit's effects, and those effects still hold the render's
  // "never fetched" slice, so they would fetch again, once per consumer.
  const settledAt = useRef<Record<SliceKey, number | null>>({ ...NEVER_SETTLED });
  // Bumped on every cache wipe. A fetch started before the wipe belongs to the
  // previous account (or a signed-out session) and must not land in this one.
  const accountGen = useRef(0);

  const clearAll = useCallback(() => {
    accountGen.current += 1;
    setDashboard(EMPTY_SLICE);
    setSettingsSlice(EMPTY_SLICE);
    setLeaderboard(EMPTY_SLICE);
    setFriendsLeaderboard(EMPTY_SLICE);
    inflight.current = { ...IDLE_INFLIGHT };
    settledAt.current = { ...NEVER_SETTLED };
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
    accountGen.current += 1;
    setDashboard(EMPTY_SLICE);
    setSettingsSlice(EMPTY_SLICE);
    setLeaderboard(EMPTY_SLICE);
    setFriendsLeaderboard(EMPTY_SLICE);
    inflight.current = { ...IDLE_INFLIGHT };
    settledAt.current = { ...NEVER_SETTLED };
  }

  const authed = Boolean(user) && !isAnonymous;

  // Generic loader: skeleton only on a cold slice; warm slices refresh silently.
  // `onData` runs only for a result that is committed, so side effects of a
  // previous account's late response are dropped along with its data.
  const load = useCallback(
    async <T,>(
      key: SliceKey,
      slice: Slice<T>,
      set: (s: Slice<T>) => void,
      fetcher: () => Promise<T | null>,
      onData?: (data: T) => void,
    ) => {
      if (inflight.current[key]) return;
      inflight.current[key] = true;
      const gen = accountGen.current;
      const sameAccount = () => gen === accountGen.current;
      const cold = slice.data === null;
      if (cold) set({ ...slice, loading: true, error: false });
      try {
        const data = await fetcher();
        // The account changed mid-flight: the wipe already reset this slice and
        // its inflight flag, and a fetch for the new account may be running.
        if (!sameAccount()) return;
        settledAt.current[key] = Date.now();
        if (data === null) {
          // Failed fetch: keep any prior data (mark error only when cold), and
          // stamp fetchedAt so the TTL throttles retries into a backoff instead
          // of hammering the endpoint every render while it's down.
          set({ data: slice.data, loading: false, error: slice.data === null, fetchedAt: Date.now() });
        } else {
          set({ data, loading: false, error: false, fetchedAt: Date.now() });
          onData?.(data);
        }
      } catch {
        if (!sameAccount()) return;
        settledAt.current[key] = Date.now();
        set({ ...slice, loading: false, error: cold, fetchedAt: Date.now() });
      } finally {
        if (sameAccount()) inflight.current[key] = false;
      }
    },
    [],
  );

  const isStale = (key: SliceKey) => {
    const at = settledAt.current[key];
    return at === null || Date.now() - at > TTL_MS;
  };

  const ensureDashboard = useCallback(() => {
    if (!authed) return;
    // Gate on staleness only — a failed fetch stamps settledAt, so the TTL backs
    // off retries. Gating on `error` here would refetch every render (no data
    // means each failure yields a new slice identity → effect re-fires → loop).
    if (!isStale("dashboard")) return;
    void load("dashboard", dashboard, setDashboard, () =>
      apiFetch("/api/dashboard").then((r) => (r.ok ? (r.json() as Promise<DashboardData>) : null)).catch(() => null),
    );
  }, [authed, dashboard, load]);

  const ensureSettings = useCallback(() => {
    if (!authed) return;
    if (!isStale("settings")) return;
    void load(
      "settings",
      settings,
      setSettingsSlice,
      () =>
        apiFetch("/api/settings")
          .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
          .then(settingsFromResponse)
          .catch(() => null),
      (d) => setLeaderboardConsent(d.leaderboardConsent),
    );
  }, [authed, settings, load]);

  const ensureLeaderboard = useCallback(() => {
    if (!authed) return;
    if (!isStale("leaderboard")) return;
    void load("leaderboard", leaderboard, setLeaderboard, () =>
      apiFetch("/api/climb/leaderboard")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d ? (d.climbers ?? []) : null))
        .catch(() => null),
    );
  }, [authed, leaderboard, load]);

  const refreshLeaderboard = useCallback(async () => {
    await load("leaderboard", { ...leaderboard, fetchedAt: null }, setLeaderboard, () =>
      apiFetch("/api/climb/leaderboard")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d ? (d.climbers ?? []) : null))
        .catch(() => null),
    );
  }, [leaderboard, load]);

  const fetchFriendsBoard = useCallback(
    () =>
      apiFetch("/api/climb/leaderboard/friends")
        .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
        .then((d) => (d === null ? null : parseFriendsBoard(d)))
        .catch(() => null),
    [],
  );

  const ensureFriendsLeaderboard = useCallback(() => {
    if (!authed) return;
    if (!isStale("friendsLeaderboard")) return;
    void load("friendsLeaderboard", friendsLeaderboard, setFriendsLeaderboard, fetchFriendsBoard);
  }, [authed, friendsLeaderboard, load, fetchFriendsBoard]);

  const refreshFriendsLeaderboard = useCallback(async () => {
    await load(
      "friendsLeaderboard",
      { ...friendsLeaderboard, fetchedAt: null },
      setFriendsLeaderboard,
      fetchFriendsBoard,
    );
  }, [friendsLeaderboard, load, fetchFriendsBoard]);

  const refreshSettings = useCallback(async () => {
    await load("settings", { ...settings, fetchedAt: null }, setSettingsSlice, () =>
      apiFetch("/api/settings")
        .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
        .then(settingsFromResponse)
        .catch(() => null),
    );
  }, [settings, load]);

  const setSettings = useCallback((next: SettingsData) => {
    settledAt.current.settings = Date.now();
    setSettingsSlice({ data: next, loading: false, error: false, fetchedAt: Date.now() });
  }, []);

  const invalidate = useCallback(
    (keys: SliceKey[]) => {
      const markStale = <T,>(s: Slice<T>): Slice<T> => ({ ...s, fetchedAt: null });
      for (const key of keys) settledAt.current[key] = null;
      // The new slice identity re-runs the consumers' ensure effects.
      if (keys.includes("dashboard")) setDashboard(markStale);
      if (keys.includes("settings")) setSettingsSlice(markStale);
      if (keys.includes("leaderboard")) setLeaderboard(markStale);
      if (keys.includes("friendsLeaderboard")) setFriendsLeaderboard(markStale);
    },
    [],
  );

  const value = useMemo<AppDataState>(
    () => ({
      dashboard,
      settings,
      leaderboard,
      friendsLeaderboard,
      ensureDashboard,
      ensureSettings,
      ensureLeaderboard,
      refreshLeaderboard,
      ensureFriendsLeaderboard,
      refreshFriendsLeaderboard,
      refreshSettings,
      setSettings,
      invalidate,
      clearAll,
    }),
    [
      dashboard,
      settings,
      leaderboard,
      friendsLeaderboard,
      ensureDashboard,
      ensureSettings,
      ensureLeaderboard,
      refreshLeaderboard,
      ensureFriendsLeaderboard,
      refreshFriendsLeaderboard,
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
  const { leaderboard, ensureLeaderboard, refreshLeaderboard } = useAppData();
  useEffect(() => {
    ensureLeaderboard();
  }, [ensureLeaderboard]);
  return { ...leaderboard, refreshLeaderboard };
}

/**
 * Cached friends board slice. Fetches only while `enabled` (the Friends tab is
 * open), so players who never open it don't pay for the request.
 */
export function useFriendsLeaderboard(enabled: boolean) {
  const { friendsLeaderboard, ensureFriendsLeaderboard, refreshFriendsLeaderboard } = useAppData();
  useEffect(() => {
    if (enabled) ensureFriendsLeaderboard();
  }, [enabled, ensureFriendsLeaderboard]);
  return { ...friendsLeaderboard, refreshFriendsLeaderboard };
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
