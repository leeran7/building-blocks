"use client";

/**
 * The web /play page's interstitial before "Climb again" (the ads plan,
 * placement A): H5 Games Ads, paced like the iOS app by src/lib/adPacing.ts.
 * Returns undefined when web ads are off (no NEXT_PUBLIC_ADSENSE_CLIENT), so
 * the page then behaves exactly as before.
 */

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { createInterstitialPacer, type InterstitialPacer } from "../../lib/adPacing";
import { createH5Ads, parseAdsenseClient } from "../../lib/ads/h5Ads";

const h5 = createH5Ads(parseAdsenseClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT), {
  testMode: process.env.NODE_ENV !== "production",
});

// One pacer per page session, started the first time /play mounts.
let pacer: InterstitialPacer | null = null;
function sessionPacer(): InterstitialPacer {
  pacer ??= createInterstitialPacer(Date.now());
  return pacer;
}

export function usePlayAgainAd(): (() => Promise<void>) | undefined {
  const { user, token } = useAuth();
  // A player who has bought gems sees no interstitials (GET /api/shop adFree).
  const adFree = useRef(false);

  useEffect(() => {
    if (!h5.enabled) return;
    sessionPacer();
    h5.preload();
  }, []);

  useEffect(() => {
    adFree.current = false;
    if (!h5.enabled || !token || !user || user.isAnonymous) return;
    let cancelled = false;
    fetch("/api/shop", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (!cancelled && typeof body === "object" && body !== null && (body as { adFree?: unknown }).adFree === true) {
          adFree.current = true;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  return useMemo(
    () =>
      h5.enabled
        ? async () => {
            const p = sessionPacer();
            if (!p.playAgain(Date.now(), adFree.current)) return;
            const outcome = await h5.interstitial();
            if (outcome === "finished" || outcome === "skipped") p.adShown();
          }
        : undefined,
    [],
  );
}
