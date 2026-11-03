/**
 * Ads on the web site through Google's H5 Games Ads (the Ad Placement API:
 * adBreak / adConfig on adsbygoogle.js). Used for one placement only: the
 * interstitial before "Climb again" on /play (the ads plan, placement A),
 * paced by src/lib/adPacing.ts.
 *
 * Off unless NEXT_PUBLIC_ADSENSE_CLIENT holds an AdSense publisher id
 * ("ca-pub-" and digits). Nothing loads, and no request leaves the page, when
 * it is off. Every call resolves: a blocked script, no fill or a lost
 * callback settles within AD_BREAK_MAX_MS, so the game is never stuck.
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
/** Hard cap on one ad break, so a lost callback cannot block the game. */
export const AD_BREAK_MAX_MS = 60_000;

/** The publisher id, or null when it is missing or not an AdSense id. */
export function parseAdsenseClient(raw: string | undefined): string | null {
  return typeof raw === "string" && /^ca-pub-\d{10,20}$/.test(raw) ? raw : null;
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
    document.head.appendChild(s);
    w.adConfig({ preloadAdBreaks: "on", sound: "on" });
  }

  function interstitial(onStart?: () => void): Promise<H5AdOutcome> {
    if (!client) return Promise.resolve("unavailable");
    preload();
    const w = window as AdsWindow;
    return new Promise((resolve) => {
      let settled = false;
      const cap = setTimeout(() => settle("error"), AD_BREAK_MAX_MS);
      function settle(outcome: H5AdOutcome): void {
        if (settled) return;
        settled = true;
        clearTimeout(cap);
        resolve(outcome);
      }
      try {
        w.adBreak?.({
          type: "next",
          name: "climb-again",
          beforeAd: () => {
            try {
              onStart?.();
            } catch {
              // A caller's bug must not leave the break unsettled.
            }
          },
          adBreakDone: (info) => settle(outcomeOf(info?.breakStatus)),
        });
        if (!w.adBreak) settle("unavailable");
      } catch {
        settle("error");
      }
    });
  }

  return { enabled: client !== null, preload, interstitial };
}
