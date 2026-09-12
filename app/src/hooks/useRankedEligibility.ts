"use client";

import { useEffect, useState } from "react";

interface RankedEligibility {
  /** null while loading; true/false once resolved. */
  allowed: boolean | null;
}

/**
 * Probes /api/geo/ranked to determine whether the current user's region
 * permits ranked (chip duel / tournament) features. Best-effort: network
 * failures resolve to `allowed: null` so callers can fall back gracefully.
 */
export function useRankedEligibility(enabled: boolean): RankedEligibility {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/geo/ranked")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { allowed: boolean } | null) => {
        if (!cancelled && data) setAllowed(data.allowed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { allowed };
}
