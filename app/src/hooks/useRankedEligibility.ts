"use client";

import { useEffect, useState } from "react";

interface RankedEligibility {
  /** Always a resolved boolean — seeded from the server render, never optimistic. */
  allowed: boolean;
}

/**
 * Ranked (chip duel / tournament) eligibility for the current visitor.
 *
 * The authoritative decision is made SERVER-SIDE at request time
 * (`resolveRankedEligibility` in the `/duel` and `/duel/chips` page
 * components) and handed in as `serverAllowed`, so the first paint is already
 * correct — there is no `null`/"assume available" window to flash out of.
 *
 * The `/api/geo/ranked` fetch below is revalidation only: it covers a stale
 * client router cache entry (a cached RSC payload rendered for an earlier
 * request) and network changes during a long-lived session. It can only ever
 * replace the server value with another server-derived value — it never
 * defaults to allowed.
 *
 * `serverAllowed` is a required parameter on purpose: a caller cannot render
 * this gate without a server-derived answer.
 */
export function useRankedEligibility(
  enabled: boolean,
  serverAllowed: boolean
): RankedEligibility {
  const [allowed, setAllowed] = useState<boolean>(serverAllowed);

  // Re-seed if the server sends down a different answer (e.g. a client-side
  // navigation re-renders the page component for a new request).
  useEffect(() => {
    setAllowed(serverAllowed);
  }, [serverAllowed]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/geo/ranked")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { allowed: boolean } | null) => {
        if (!cancelled && typeof data?.allowed === "boolean") setAllowed(data.allowed);
      })
      .catch(() => {
        // Best-effort: on failure we keep the server-rendered decision.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { allowed };
}
