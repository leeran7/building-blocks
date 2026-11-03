/**
 * Ads in the iOS app through Google AdMob (@capacitor-community/admob).
 *
 * Two placements only (the ads plan Leeran approved on 2026-11-03):
 *  - midgame: an interstitial before Endless "Play again", paced by
 *    src/lib/adPacing.ts;
 *  - rewarded: "Watch ad · +1 life" when out of lives. The life itself is
 *    granted by the server (POST /api/levels/lives/ad), never here.
 *
 * Every call resolves, whatever the SDK does: an ad that fails to load, never
 * starts or loses its callback settles as "error" within a time cap, so the
 * game is never stuck behind an ad. Android is not supported, and the web
 * build of this bundle has no AdMob, so both report enabled = false.
 *
 * The SDK starts lazily on the first ad request: initialize, then Apple's
 * tracking prompt (ATT) and Google's consent form (UMP, EEA/UK) when they
 * apply. A player who declines tracking still gets ads, just not
 * personalised ones; where consent is required and missing, no ad is asked for.
 */

import type { AdCallbacks, AdOutcome, AdsAdapter } from "../types";

/** How long loading an ad may take before the request gives up. */
export const AD_LOAD_TIMEOUT_MS = 8_000;
/** A loaded ad that has not appeared on screen by then is treated as an error. */
export const AD_START_TIMEOUT_MS = 8_000;
/** Hard cap on one ad from show to dismiss, so a lost callback cannot block the game. */
export const AD_MAX_MS = 180_000;

type Listener = { remove: () => Promise<void> | void };

/** The slice of the AdMob plugin used here; a fake implements it in tests. */
export interface AdMobLike {
  initialize(options?: { initializeForTesting?: boolean }): Promise<void>;
  trackingAuthorizationStatus(): Promise<{ status: string }>;
  requestTrackingAuthorization(): Promise<void>;
  requestConsentInfo(): Promise<{ status: string; isConsentFormAvailable?: boolean; canRequestAds: boolean }>;
  showConsentForm(): Promise<{ status: string; canRequestAds: boolean }>;
  prepareInterstitial(options: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showInterstitial(): Promise<void>;
  prepareRewardVideoAd(options: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showRewardVideoAd(): Promise<unknown>;
  addListener(event: string, fn: (data?: unknown) => void): Promise<Listener>;
}

/** Event names, as the plugin emits them (InterstitialAdPluginEvents / RewardAdPluginEvents). */
export const ADMOB_EVENTS = {
  interstitial: {
    showed: "interstitialAdShowed",
    dismissed: "interstitialAdDismissed",
    failedToShow: "interstitialAdFailedToShow",
  },
  rewarded: {
    showed: "onRewardedVideoAdShowed",
    dismissed: "onRewardedVideoAdDismissed",
    failedToShow: "onRewardedVideoAdFailedToShow",
    rewarded: "onRewardedVideoAdReward",
  },
} as const;

export interface AdMobAdsOptions {
  /** "ios" turns ads on; anything else (android, web) leaves them off. */
  platform: string;
  units: { interstitial: string; rewarded: string };
  /** Test units: the SDK is started in test mode. */
  testing: boolean;
  /** Loads the plugin; called once, on the first ad request. */
  load: () => Promise<AdMobLike>;
}

export function createAdMobAds(opts: AdMobAdsOptions): AdsAdapter {
  const ios = opts.platform === "ios";
  const interstitialOn = ios && opts.units.interstitial !== "";
  const rewardedOn = ios && opts.units.rewarded !== "";
  let ready: Promise<AdMobLike | null> | null = null;
  let busy = false;

  /** Start the SDK once; null when it cannot serve ads (failed, or no consent). */
  function start(): Promise<AdMobLike | null> {
    ready ??= (async () => {
      try {
        const sdk = await opts.load();
        await sdk.initialize({ initializeForTesting: opts.testing });
        const tracking = await sdk.trackingAuthorizationStatus().catch(() => null);
        if (tracking?.status === "notDetermined") await sdk.requestTrackingAuthorization().catch(() => {});
        let consent = await sdk.requestConsentInfo();
        if (consent.status === "REQUIRED" && consent.isConsentFormAvailable) {
          consent = await sdk.showConsentForm();
        }
        return consent.canRequestAds ? sdk : null;
      } catch {
        return null;
      }
    })();
    const attempt = ready;
    // A start that failed is tried again on the next request.
    void attempt.then((sdk) => {
      if (sdk === null && ready === attempt) ready = null;
    });
    return attempt;
  }

  async function show(kind: "interstitial" | "rewarded", cb: AdCallbacks | undefined): Promise<AdOutcome> {
    if (kind === "interstitial" ? !interstitialOn : !rewardedOn) return "unavailable";
    if (busy) return "error";
    busy = true;
    try {
      const sdk = await start();
      if (!sdk) return "unavailable";
      const adId = kind === "interstitial" ? opts.units.interstitial : opts.units.rewarded;
      const prepare =
        kind === "interstitial"
          ? sdk.prepareInterstitial({ adId, isTesting: opts.testing })
          : sdk.prepareRewardVideoAd({ adId, isTesting: opts.testing });
      const loaded = await withTimeout(
        prepare.then(() => true),
        AD_LOAD_TIMEOUT_MS,
      );
      if (loaded !== true) return "error";
      return await present(sdk, kind, cb);
    } catch {
      return "error";
    } finally {
      busy = false;
    }
  }

  return {
    enabled: interstitialOn || rewardedOn,
    midgame: (cb) => show("interstitial", cb),
    rewarded: (cb) => show("rewarded", cb),
  };
}

/** Show a loaded ad and wait for it to close. */
function present(sdk: AdMobLike, kind: "interstitial" | "rewarded", cb: AdCallbacks | undefined): Promise<AdOutcome> {
  const events = ADMOB_EVENTS[kind];
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let earned = false;
    const listeners: Promise<Listener>[] = [];
    const startTimer = setTimeout(() => {
      if (!started) settle("error");
    }, AD_START_TIMEOUT_MS);
    const capTimer = setTimeout(() => settle("error"), AD_MAX_MS);
    function settle(outcome: AdOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      clearTimeout(capTimer);
      for (const l of listeners) void l.then((h) => h.remove()).catch(() => {});
      resolve(outcome);
    }
    const on = (event: string, fn: () => void) => {
      listeners.push(sdk.addListener(event, fn));
    };
    on(events.showed, () => {
      if (settled || started) return;
      started = true;
      clearTimeout(startTimer);
      try {
        cb?.onStart?.();
      } catch {
        // A caller's bug must not leave the ad unsettled.
      }
    });
    on(events.failedToShow, () => settle("error"));
    if (kind === "rewarded") on(ADMOB_EVENTS.rewarded.rewarded, () => (earned = true));
    // A rewarded ad closed before the reward was earned is a skip: no life.
    on(events.dismissed, () => settle(kind === "interstitial" || earned ? "finished" : "skipped"));
    // Listen before showing, so no event is missed.
    void Promise.all(listeners).then(
      () => {
        if (settled) return;
        const shown = kind === "interstitial" ? sdk.showInterstitial() : sdk.showRewardVideoAd();
        shown.then(undefined, () => settle("error"));
      },
      () => settle("error"),
    );
  });
}

/** The promise's value, or null when it rejects or takes longer than `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
