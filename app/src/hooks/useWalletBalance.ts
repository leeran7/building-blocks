"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "../lib/authedFetch";

interface WalletResponse {
  playCents: number;
  canClaimDailyChips?: boolean;
}

/**
 * Fetches and caches the user's chip balance from /api/wallet.
 * Pass a refreshTrigger value that changes whenever you want to force a refetch
 * (e.g. after a daily claim or purchase).
 *
 * `canClaimDailyChips` starts null (unknown, still loading) so callers can hide
 * the claim button until the server confirms the grant is actually available.
 */
export function useWalletBalance(
  token: string | null,
  refreshTrigger?: unknown
): {
  playCents: number | null;
  canClaimDailyChips: boolean | null;
  refresh: () => Promise<void>;
} {
  const [playCents, setPlayCents] = useState<number | null>(null);
  const [canClaimDailyChips, setCanClaimDailyChips] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/wallet", token);
      if (res.ok) {
        const data = (await res.json()) as WalletResponse;
        setPlayCents(data.playCents ?? 0);
        setCanClaimDailyChips(data.canClaimDailyChips ?? false);
      }
    } catch {
      // Non-critical — leave prior balance on screen.
    }
  }, [token]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, refreshTrigger]);

  return { playCents, canClaimDailyChips, refresh };
}
