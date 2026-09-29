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
import { useAuth } from "./AuthContext";
import { createMockLevelsClient } from "../lib/levels/mockClient";
import { createHttpLevelsClient } from "../lib/levels/httpClient";
import { season1Catalog } from "../lib/levels/catalog";
import { withMockFallback } from "../lib/levels/fallbackClient";
import { createBestFailStore, type BestFailStore } from "../lib/levels/nearMiss";
import type { BuyLivesResult, LevelsClient, PlayerStats, SeasonView } from "../lib/levels/model";

/**
 * The level map's data: the current season, the player's lives and XP, and
 * the client that starts and scores level runs. One fetch feeds the map, the
 * level start card and the result card; each screen calls `refresh` or
 * `setPlayer` after a run so the map never shows a stale life count.
 */

interface LevelsValue {
  client: LevelsClient;
  season: SeasonView | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  /** Apply lives and XP the server just returned, without a refetch. */
  setPlayer: (player: PlayerStats) => void;
  /** Best failed height per level, on this device (near-miss markers, §6.2). */
  bestFails: BestFailStore;
  /**
   * Top lives up to full with gems, and apply the new lives and balance. Null
   * when no refill can be sold (the client or the season has no price).
   */
  buyLives: (() => Promise<BuyLivesResult>) | null;
}

const LevelsContext = createContext<LevelsValue | null>(null);

export function LevelsProvider({
  children,
  client: injected,
  bestFails: injectedBestFails,
}: {
  children: ReactNode;
  /** Tests and the screenshot harness pass their own client. */
  client?: LevelsClient;
  bestFails?: BestFailStore;
}) {
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const uid = user && !isAnonymous ? user.uid : null;
  const client = useMemo(
    () =>
      injected ??
      withMockFallback(createHttpLevelsClient({ catalog: season1Catalog() }), () =>
        createMockLevelsClient({ accountId: uid ?? undefined }),
      ),
    [injected, uid],
  );
  const bestFails = useMemo(
    () => injectedBestFails ?? createBestFailStore({ accountId: uid }),
    [injectedBestFails, uid],
  );
  const [season, setSeason] = useState<SeasonView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const next = await client.getSeason();
      if (id === request.current) setSeason(next);
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      request.current += 1;
      setSeason(null);
      return;
    }
    void refresh();
  }, [authLoading, uid, refresh]);

  const setPlayer = useCallback((player: PlayerStats) => {
    setSeason((s) => (s ? { ...s, player } : s));
  }, []);

  const canBuyLives = Boolean(client.buyLives) && season?.refill != null;
  const buyLives = useCallback(async (): Promise<BuyLivesResult> => {
    const res = client.buyLives ? await client.buyLives() : ({ ok: false, code: "NETWORK" } as const);
    if (res.ok) {
      setSeason((s) => (s && s.refill ? { ...s, player: res.player, refill: { ...s.refill, gems: res.gems } } : s));
    } else if (res.code === "NOT_ENOUGH_GEMS" && res.gems !== undefined) {
      const gems = res.gems;
      setSeason((s) => (s && s.refill ? { ...s, refill: { ...s.refill, gems } } : s));
    } else if (res.code === "LIVES_FULL") {
      // Lives came back (the timer, a refund) since the card was drawn.
      void refresh();
    }
    return res;
  }, [client, refresh]);

  const value = useMemo<LevelsValue>(
    () => ({
      client,
      season,
      loading,
      error,
      refresh,
      setPlayer,
      bestFails,
      buyLives: canBuyLives ? buyLives : null,
    }),
    [client, season, loading, error, refresh, setPlayer, bestFails, canBuyLives, buyLives],
  );
  return <LevelsContext.Provider value={value}>{children}</LevelsContext.Provider>;
}

export function useLevels(): LevelsValue {
  const value = useContext(LevelsContext);
  if (!value) throw new Error("useLevels must be used inside LevelsProvider");
  return value;
}
