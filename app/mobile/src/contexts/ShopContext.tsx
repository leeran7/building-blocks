import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { fetchShop, settleUnfinishedPurchases, watchAppleTransactions, type ShopState } from "../lib/shop";

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
  const inFlight = useRef<Promise<void> | null>(null);

  // A different account never sees the last one's balance: reset, and let a
  // fetch still in flight for the previous account land nowhere.
  const uid = user?.uid ?? null;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  useEffect(() => {
    setShop(null);
    setError(null);
    settled.current = false;
    inFlight.current = null;
  }, [uid]);

  // Gem packs StoreKit delivers while the app is open (an Ask to Buy approval).
  useEffect(() => {
    if (uid === null) return;
    return watchAppleTransactions((gems) => {
      if (uidRef.current === uid) setShop((s) => (s ? { ...s, gems } : s));
    });
  }, [uid]);

  const refresh = useCallback(() => {
    // Screens mounting together share one fetch.
    if (inFlight.current) return inFlight.current;
    const forUid = uidRef.current;
    const current = () => uidRef.current === forUid;
    let run: Promise<void> | null = null;
    run = (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchShop();
        if (!current()) return;
        setShop(next);
        // Once per session: credit any App Store pack paid for but not finished.
        if (!settled.current) {
          settled.current = true;
          const gems = await settleUnfinishedPurchases(next);
          if (gems !== null && current()) setShop((s) => (s ? { ...s, gems } : s));
        }
      } catch (err) {
        if (current()) setError(err instanceof Error ? err.message : "Couldn't load the Shop.");
      } finally {
        if (inFlight.current === run) inFlight.current = null;
        setLoading(false);
      }
    })();
    inFlight.current = run;
    return run;
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

/**
 * The Shop slice when a ShopProvider is mounted, else null. Never fetches:
 * for screens outside the Shop that only mirror a balance they already know
 * (the lives refill) and must also render without the Shop.
 */
export function useOptionalShop(): ShopContextValue | null {
  return useContext(ShopContext);
}
