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
import type { LevelsClient, PlayerStats, SeasonView } from "../lib/levels/model";

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
}

const LevelsContext = createContext<LevelsValue | null>(null);

export function LevelsProvider({
  children,
  client: injected,
}: {
  children: ReactNode;
  /** Tests and the screenshot harness pass their own client. */
  client?: LevelsClient;
}) {
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const uid = user && !isAnonymous ? user.uid : null;
  const client = useMemo(
    () => injected ?? createMockLevelsClient({ accountId: uid ?? undefined }),
    [injected, uid],
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

  const value = useMemo<LevelsValue>(
    () => ({ client, season, loading, error, refresh, setPlayer }),
    [client, season, loading, error, refresh, setPlayer],
  );
  return <LevelsContext.Provider value={value}>{children}</LevelsContext.Provider>;
}

export function useLevels(): LevelsValue {
  const value = useContext(LevelsContext);
  if (!value) throw new Error("useLevels must be used inside LevelsProvider");
  return value;
}
