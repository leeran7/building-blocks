/**
 * Ads on the web site through Google's H5 Games Ads (the Ad Placement API:
 * adBreak / adConfig on adsbygoogle.js). Used for one placement only: the
 * interstitial before "Climb again" on /play (the ads plan, placement A),
 * paced by src/lib/adPacing.ts.
 *
 * On for the production site with Doomstack's publisher id
 * (DOOMSTACK_ADSENSE_CLIENT), off on previews and locally; see
 * adsenseClientFor. Nothing loads, and no request leaves the page, when it is
 * off. Every call resolves: a blocked script or no fill settles within
 * AD_BREAK_START_MS, a lost callback within AD_BREAK_MAX_MS, so the game is
 * never stuck.
 */

/** How an ad break ended. "finished" and "skipped" mean an ad played. */
export type H5AdOutcome = "finished" | "skipped" | "unavailable" | "error";

export interface H5Ads {
  readonly enabled: boolean;
  /** Load the script early, so the first break has an ad ready. Idempotent. */
  preload(): void;
  /** An interstitial at a natural break. `onStart` fires as the ad appears. */
  interstitial(onStart?: () => void): Promise<H5AdOutcome>;
}

export const ADSENSE_SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
/** A break whose ad has not appeared by then is given up (blocked script, no fill). */
export const AD_BREAK_START_MS = 5_000;
/** Hard cap on one ad break, so a lost callback cannot block the game. */
export const AD_BREAK_MAX_MS = 60_000;

/**
 * Doomstack's AdSense publisher id. Public, not a secret: it is in ads.txt
 * and in every ad request.
 */
export const DOOMSTACK_ADSENSE_CLIENT = "ca-pub-3923007405625474";

/** The publisher id, or null when it is missing or not an AdSense id. */
export function parseAdsenseClient(raw: string | undefined): string | null {
  return typeof raw === "string" && /^ca-pub-\d{10,20}$/.test(raw) ? raw : null;
}

/**
 * Which publisher id the web site serves ads for. NEXT_PUBLIC_ADSENSE_CLIENT,
 * when set, decides: another valid id, or anything else (e.g. "off") to turn
 * web ads off. Unset, only the production deploy shows ads, with ours, so
 * previews and local dev never send traffic to the live AdSense account.
 */
export function adsenseClientFor(env: { override?: string; vercelEnv?: string }): string | null {
  if (env.override !== undefined) return parseAdsenseClient(env.override);
  return env.vercelEnv === "production" ? DOOMSTACK_ADSENSE_CLIENT : null;
}

interface AdBreakDoneInfo {
  breakStatus?: string;
}

interface AdBreakParams {
  type: "next";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: AdBreakDoneInfo) => void;
}

type AdsWindow = Window & {
  adsbygoogle?: unknown[];
  adBreak?: (o: AdBreakParams) => void;
  adConfig?: (o: Record<string, unknown>) => void;
};

/** What a finished break's status means for the caller. */
export function outcomeOf(status: string | undefined): H5AdOutcome {
  if (status === "viewed") return "finished";
  if (status === "dismissed") return "skipped";
  // notReady, timeout, noAdPreloaded, frequencyCapped, ignored, other...
  return status === "error" ? "error" : "unavailable";
}

export function createH5Ads(client: string | null, opts: { testMode?: boolean } = {}): H5Ads {
  let loaded = false;
  // The script failed to load (ad blocker, CSP, offline): no break can play.
  let failed = false;

  function preload(): void {
    if (!client || loaded || typeof document === "undefined") return;
    loaded = true;
    const w = window as AdsWindow;
    w.adsbygoogle = w.adsbygoogle || [];
    // Google's documented shim: adBreak/adConfig queue onto adsbygoogle until it loads.
    w.adBreak = w.adConfig = (o: object) => {
      w.adsbygoogle!.push(o);
    };
    const s = document.createElement("script");
    s.async = true;
    s.src = `${ADSENSE_SCRIPT}?client=${encodeURIComponent(client)}`;
    s.crossOrigin = "anonymous";
    if (opts.testMode) s.setAttribute("data-adbreak-test", "on");
    s.onerror = () => {
      failed = true;
    };
    document.head.appendChild(s);
    w.adConfig({ preloadAdBreaks: "on", sound: "on" });
  }

  function interstitial(onStart?: () => void): Promise<H5AdOutcome> {
    if (!client) return Promise.resolve("unavailable");
    preload();
    if (failed) return Promise.resolve("unavailable");
    const w = window as AdsWindow;
    return new Promise((resolve) => {
      let settled = false;
      const startTimer = setTimeout(() => settle("unavailable"), AD_BREAK_START_MS);
      const cap = setTimeout(() => settle("error"), AD_BREAK_MAX_MS);
      function settle(outcome: H5AdOutcome): void {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(cap);
        resolve(outcome);
      }
      try {
        w.adBreak?.({
          type: "next",
          name: "climb-again",
          beforeAd: () => {
            clearTimeout(startTimer);
            try {
              onStart?.();
            } catch {
              // A caller's bug must not leave the break unsettled.
            }
          },
          adBreakDone: (info) => settle(outcomeOf(info?.breakStatus)),
        });
      } catch {
        settle("error");
      }
    });
  }

  return { enabled: client !== null, preload, interstitial };
}
