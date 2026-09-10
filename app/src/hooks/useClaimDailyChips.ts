"use client";

import { useCallback, useState } from "react";

export type ClaimDailyChipsState =
  | { status: "idle" }
  | { status: "claiming" }
  | { status: "claimed"; balanceAfter: number }
  | { status: "already-claimed" }
  | { status: "error"; message: string };

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
      const res = await fetch("/api/duel/chips/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
