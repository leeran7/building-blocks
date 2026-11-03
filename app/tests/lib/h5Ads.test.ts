// @vitest-environment jsdom
/**
 * Web ads (src/lib/ads/h5Ads.ts): off without a valid AdSense id, Google's
 * break statuses mapped to outcomes, and a break that never calls back still
 * settles so "Climb again" always starts the run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AD_BREAK_MAX_MS, createH5Ads, outcomeOf, parseAdsenseClient } from "../../src/lib/ads/h5Ads";
import { GET as adsTxt } from "../../app/ads.txt/route";

type AdsWindow = Window & { adBreak?: (o: Record<string, unknown>) => void; adsbygoogle?: unknown[] };

describe("parseAdsenseClient", () => {
  it("accepts an AdSense publisher id and rejects anything else", () => {
    expect(parseAdsenseClient("ca-pub-1234567890123456")).toBe("ca-pub-1234567890123456");
    for (const bad of [undefined, "", "pub-1234567890123456", "ca-pub-12", "ca-pub-1234567890123456\"><script>", " ca-pub-1234567890123456"]) {
      expect(parseAdsenseClient(bad)).toBeNull();
    }
  });
});

describe("outcomeOf", () => {
  it("counts only a viewed break as finished and a dismissed one as skipped", () => {
    expect(outcomeOf("viewed")).toBe("finished");
    expect(outcomeOf("dismissed")).toBe("skipped");
    expect(outcomeOf("error")).toBe("error");
    for (const s of ["notReady", "timeout", "noAdPreloaded", "frequencyCapped", "ignored", "other", undefined]) {
      expect(outcomeOf(s)).toBe("unavailable");
    }
  });
});

describe("createH5Ads", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    delete (window as AdsWindow).adBreak;
    delete (window as AdsWindow).adsbygoogle;
  });
  afterEach(() => vi.useRealTimers());

  it("loads nothing and shows nothing without a publisher id", async () => {
    const ads = createH5Ads(null);
    expect(ads.enabled).toBe(false);
    ads.preload();
    expect(document.querySelector("script")).toBeNull();
    expect(await ads.interstitial()).toBe("unavailable");
  });

  it("loads adsbygoogle once with the publisher id and resolves on the break's status", async () => {
    const ads = createH5Ads("ca-pub-1234567890123456");
    ads.preload();
    ads.preload();
    const scripts = document.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456");

    const onStart = vi.fn();
    (window as AdsWindow).adBreak = (o) => {
      (o.beforeAd as () => void)();
      (o.adBreakDone as (i: { breakStatus: string }) => void)({ breakStatus: "viewed" });
    };
    expect(await ads.interstitial(onStart)).toBe("finished");
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("settles a break that never calls back", async () => {
    vi.useFakeTimers();
    const ads = createH5Ads("ca-pub-1234567890123456");
    ads.preload();
    (window as AdsWindow).adBreak = () => {};
    const p = ads.interstitial();
    await vi.advanceTimersByTimeAsync(AD_BREAK_MAX_MS);
    expect(await p).toBe("error");
  });
});

describe("GET /ads.txt", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  });

  it("names the publisher as a direct Google seller, and is absent while web ads are off", async () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT = "ca-pub-1234567890123456";
    const res = adsTxt();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT = "not-an-id";
    expect(adsTxt().status).toBe(404);
  });
});
