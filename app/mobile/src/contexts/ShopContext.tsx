import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { fetchShop, settleUnfinishedPurchases, type ShopState } from "../lib/shop";

/**
 * The player's gems and owned characters/skins, shared by every Shop screen so
 * the balance pill, Skin Details and the gem-pack sheet agree. Loaded when a
 * Shop screen first asks (useShop), then kept by the purchase results.
 */
interface ShopContextValue {
  shop: ShopState | null;
  loading: boolean;
  error: string | null;
  /** Fetch from the server (also on first use). */
  refresh: () => Promise<void>;
  /** Apply a server-confirmed balance and, when given, owned ids. */
  apply: (next: { gems: number; ownedIds?: string[] }) => void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [shop, setShop] = useState<ShopState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  // A different account never sees the last one's balance.
  const uid = user?.uid ?? null;
  useEffect(() => {
    setShop(null);
    setError(null);
    settled.current = false;
  }, [uid]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchShop();
      setShop(next);
      // Once per session: credit any App Store pack paid for but not finished.
      if (!settled.current) {
        settled.current = true;
        const gems = await settleUnfinishedPurchases(next);
        if (gems !== null) setShop((s) => (s ? { ...s, gems } : s));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the Shop.");
    } finally {
      setLoading(false);
    }
  }, []);

  const apply = useCallback((next: { gems: number; ownedIds?: string[] }) => {
    setShop((s) => (s ? { ...s, gems: next.gems, ownedIds: next.ownedIds ?? s.ownedIds } : s));
  }, []);

  const value = useMemo(() => ({ shop, loading, error, refresh, apply }), [shop, loading, error, refresh, apply]);
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

/** The Shop slice; fetches it on first use. */
export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  const { shop, loading, error, refresh } = ctx;
  useEffect(() => {
    if (shop === null && !loading && error === null) void refresh();
  }, [shop, loading, error, refresh]);
  return ctx;
}
