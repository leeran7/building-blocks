/**
 * The iOS app's AdMob adapter (mobile/src/targets/app/admob.ts), against a
 * fake plugin: what each SDK event sequence resolves to, that a lost callback
 * still settles, and that it never asks for an ad off iOS or without consent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMOB_EVENTS,
  AD_LOAD_TIMEOUT_MS,
  AD_MAX_MS,
  AD_START_TIMEOUT_MS,
  createAdMobAds,
  type AdMobLike,
} from "../../mobile/src/targets/app/admob";

const UNITS = { interstitial: "ca-app-pub-1/1", rewarded: "ca-app-pub-1/2" };

type Script = string[] | "hang" | "reject";

/** A fake plugin: each show emits the scripted events in order. */
function fakeSdk(opts: { show?: Script; prepare?: "ok" | "reject" | "hang"; consent?: { status: string; canRequestAds: boolean; isConsentFormAvailable?: boolean } } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const emit = (event: string) => listeners.get(event)?.forEach((fn) => fn());
  const show = async () => {
    const script = opts.show ?? [];
    if (script === "reject") throw new Error("not ready");
    if (script === "hang") return;
    for (const event of script) emit(event);
  };
  const prepare = () =>
    opts.prepare === "reject"
      ? Promise.reject(new Error("no fill"))
      : opts.prepare === "hang"
        ? new Promise<never>(() => {})
        : Promise.resolve({ adUnitId: "x" });
  const sdk = {
    initialize: vi.fn(async () => {}),
    trackingAuthorizationStatus: vi.fn(async () => ({ status: "notDetermined" })),
    requestTrackingAuthorization: vi.fn(async () => {}),
    requestConsentInfo: vi.fn(async () => opts.consent ?? { status: "NOT_REQUIRED", canRequestAds: true }),
    showConsentForm: vi.fn(async () => ({ status: "OBTAINED", canRequestAds: true })),
    prepareInterstitial: vi.fn(prepare),
    showInterstitial: vi.fn(show),
    prepareRewardVideoAd: vi.fn(prepare),
    showRewardVideoAd: vi.fn(show),
    addListener: vi.fn(async (event: string, fn: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return { remove: () => void listeners.get(event)?.delete(fn) };
    }),
  } satisfies AdMobLike;
  return { sdk, listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0) };
}

function adapter(sdk: AdMobLike, platform = "ios") {
  return createAdMobAds({ platform, units: UNITS, testing: false, load: async () => sdk });
}

const I = ADMOB_EVENTS.interstitial;
const R = ADMOB_EVENTS.rewarded;

describe("AdMob adapter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Resolve a call that may wait on timers. */
  async function settle<T>(p: Promise<T>, advanceMs = 0): Promise<T> {
    await vi.advanceTimersByTimeAsync(advanceMs);
    return p;
  }

  it("is off and asks for nothing outside iOS or without ad units", async () => {
    const { sdk } = fakeSdk({ show: [I.showed, I.dismissed] });
    for (const ads of [adapter(sdk, "android"), adapter(sdk, "web")]) {
      expect(ads.enabled).toBe(false);
      expect(await ads.midgame()).toBe("unavailable");
      expect(await ads.rewarded()).toBe("unavailable");
    }
    const noUnits = createAdMobAds({ platform: "ios", units: { interstitial: "", rewarded: "" }, testing: false, load: async () => sdk });
    expect(noUnits.enabled).toBe(false);
    expect(await noUnits.midgame()).toBe("unavailable");
    expect(sdk.initialize).not.toHaveBeenCalled();
  });

  it("shows an interstitial, reports its start, and finishes on dismiss", async () => {
    const { sdk, listenerCount } = fakeSdk({ show: [I.showed, I.dismissed] });
    const onStart = vi.fn();
    expect(await settle(adapter(sdk).midgame({ onStart }))).toBe("finished");
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(sdk.prepareInterstitial).toHaveBeenCalledWith({ adId: UNITS.interstitial, isTesting: false });
    expect(listenerCount()).toBe(0);
  });

  it("asks for tracking once, then starts the SDK only once for many ads", async () => {
    const { sdk } = fakeSdk({ show: [I.showed, I.dismissed] });
    const ads = adapter(sdk);
    await settle(ads.midgame());
    await settle(ads.midgame());
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(sdk.requestTrackingAuthorization).toHaveBeenCalledTimes(1);
  });

  it("finishes a rewarded ad only when the reward was earned before dismiss", async () => {
    const earned = fakeSdk({ show: [R.showed, R.rewarded, R.dismissed] });
    expect(await settle(adapter(earned.sdk).rewarded())).toBe("finished");
    const closedEarly = fakeSdk({ show: [R.showed, R.dismissed] });
    expect(await settle(adapter(closedEarly.sdk).rewarded())).toBe("skipped");
  });

  it("fails without hanging when the ad cannot load, show, start or close", async () => {
    expect(await settle(adapter(fakeSdk({ prepare: "reject" }).sdk).midgame())).toBe("error");
    expect(await settle(adapter(fakeSdk({ prepare: "hang" }).sdk).midgame(), AD_LOAD_TIMEOUT_MS)).toBe("error");
    expect(await settle(adapter(fakeSdk({ show: "reject" }).sdk).rewarded())).toBe("error");
    expect(await settle(adapter(fakeSdk({ show: [R.failedToShow] }).sdk).rewarded())).toBe("error");
    // Never appears on screen.
    expect(await settle(adapter(fakeSdk({ show: "hang" }).sdk).midgame(), AD_START_TIMEOUT_MS)).toBe("error");
    // Appears, then the dismiss callback is lost.
    expect(await settle(adapter(fakeSdk({ show: [I.showed] }).sdk).midgame(), AD_MAX_MS)).toBe("error");
  });

  it("asks for no ad where consent is required and refused", async () => {
    const { sdk } = fakeSdk({ show: [I.showed, I.dismissed], consent: { status: "REQUIRED", canRequestAds: false, isConsentFormAvailable: true } });
    sdk.showConsentForm.mockResolvedValueOnce({ status: "REQUIRED", canRequestAds: false });
    expect(await settle(adapter(sdk).midgame())).toBe("unavailable");
    expect(sdk.showConsentForm).toHaveBeenCalledTimes(1);
    expect(sdk.prepareInterstitial).not.toHaveBeenCalled();
  });

  it("refuses a second ad while one is up", async () => {
    const { sdk } = fakeSdk({ show: "hang" });
    const ads = adapter(sdk);
    const first = ads.midgame();
    await vi.advanceTimersByTimeAsync(0);
    expect(await ads.rewarded()).toBe("error");
    expect(await settle(first, AD_START_TIMEOUT_MS)).toBe("error");
  });
});
