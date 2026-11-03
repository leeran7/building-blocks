import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createInterstitialPacer, type InterstitialPacer } from "@app/lib/adPacing";
import { noAds } from "../targets/noop";
import type { AdsAdapter } from "../targets/types";

/**
 * The target's ads (AdMob in the iOS app) and the session's interstitial
 * pacing, for the app's screens. Without a provider (tests, a target that
 * never shows ads) there are no ads.
 */
interface AdsContextValue {
  ads: AdsAdapter;
  /** Paces the interstitial before Endless "Play again" for this session. */
  pacer: InterstitialPacer;
}

const NO_ADS: AdsContextValue = { ads: noAds, pacer: createInterstitialPacer(0) };

const AdsContext = createContext<AdsContextValue>(NO_ADS);

export function AdsProvider({ ads, children }: { ads: AdsAdapter; children: ReactNode }) {
  // The session starts when the app does; the pacer lives as long as it.
  const [pacer] = useState(() => createInterstitialPacer(Date.now()));
  const value = useMemo(() => ({ ads, pacer }), [ads, pacer]);
  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}
