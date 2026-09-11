"use client";

import { useCallback, useState } from "react";
import { authedFetch } from "../lib/authedFetch";

export type ClaimDailyChipsState =
  | { status: "idle" }
  | { status: "claiming" }
  | { status: "claimed"; balanceAfter: number }
  | { status: "already-claimed" }
  | { status: "error"; message: string };

/**
 * Derive what the daily-chip claim UI should show, so every surface (dashboard,
 * account menu, chip lobby) hides the button the moment the grant's been claimed
 * today instead of duplicating the same three-way check.
 *
 * `canClaimDailyChips` is the server's view from /api/wallet — `null` while it's
 * still loading. We only surface the button once the grant is *confirmed*
 * available (`=== true`) and only surface the "claimed today" note once it's
 * *confirmed* claimed (`=== false`), so neither flashes during the initial load.
 */
export function dailyClaimVisibility(
  canClaimDailyChips: boolean | null,
  claimStatus: ClaimDailyChipsState["status"]
): { showClaim: boolean; claimedToday: boolean } {
  const claimedThisSession =
    claimStatus === "claimed" || claimStatus === "already-claimed";
  return {
    showClaim: canClaimDailyChips === true && !claimedThisSession,
    claimedToday: canClaimDailyChips === false || claimedThisSession,
  };
}

interface ClaimResponseBody {
  claimed?: boolean;
  balanceAfter?: number;
  code?: string;
}

/**
 * Shared claim-the-daily-chip-grant flow, so every surface that offers the
 * claim button (dashboard, duel hub, account menu, chip lobby) hits the same
 * request/error handling instead of re-implementing it. POST
 * /api/duel/chips/claim can return 429 for two different reasons — the
 * "already claimed today" business rule and the request rate limit — which
 * are distinguished by `code`, not status alone.
 */
export function useClaimDailyChips(token: string | null) {
  const [state, setState] = useState<ClaimDailyChipsState>({ status: "idle" });

  const claim = useCallback(async () => {
    if (!token) return;
    setState({ status: "claiming" });
    try {
      const res = await authedFetch("/api/duel/chips/claim", token, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as ClaimResponseBody;

      if (res.status === 429 && body.code === "ALREADY_CLAIMED") {
        setState({ status: "already-claimed" });
        return;
      }
      if (!res.ok) {
        setState({ status: "error", message: "Could not claim. Try again." });
        return;
      }
      setState({ status: "claimed", balanceAfter: body.balanceAfter ?? 0 });
    } catch {
      setState({ status: "error", message: "Network error. Try again." });
    }
  }, [token]);

  return { state, claim };
}
