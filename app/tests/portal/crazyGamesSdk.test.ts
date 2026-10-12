/**
 * CrazyGames SDK v3 adapters (mobile/src/targets/crazygames/sdk.ts): the game
 * must run with the SDK missing, blocked or throwing; an ad error is never a
 * finished ad; no midgame in the first 3 minutes; queued lifecycle calls.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AD_START_TIMEOUT_MS,
  MIDGAME_GRACE_MS,
  createCrazyGamesRuntime,
  type CrazyGamesDeps,
  type CrazySdk,
  type CrazySettings,
} from "../../mobile/src/targets/crazygames/sdk";

const AFTER_GRACE = MIDGAME_GRACE_MS;

function fakeSdk() {
  const calls: string[] = [];
  let settingsListener: ((s: CrazySettings) => void) | null = null;
  const store = new Map<string, string>();
  const sdk = {
    init: vi.fn(async () => {
      calls.push("init");
    }),
    game: {
      loadingStart: vi.fn(() => calls.push("loadingStart")),
      loadingStop: vi.fn(() => calls.push("loadingStop")),
      gameplayStart: vi.fn(() => calls.push("gameplayStart")),
      gameplayStop: vi.fn(() => calls.push("gameplayStop")),
      happytime: vi.fn(() => calls.push("happytime")),
      settings: { muteAudio: false } as CrazySettings,
      addSettingsChangeListener: vi.fn((l: (s: CrazySettings) => void) => {
        settingsListener = l;
      }),
    },
    ad: {
      requestAd: vi.fn((_type: "midgame" | "rewarded", _cb: { adStarted: () => void; adFinished: () => void; adError: (e: unknown) => void }) => {}),
    },
    data: {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
    },
  };
  return { sdk, calls, store, emitSettings: (s: CrazySettings) => settingsListener?.(s) };
}

function runtimeWith(sdk: CrazySdk | undefined, opts: { now?: () => number; scriptLoads?: boolean } = {}) {
  let installed: CrazySdk | undefined;
  // Default clock: the session starts at 0 and every later read is past the
  // midgame grace period.
  let reads = 0;
  const pastGrace = () => (reads++ === 0 ? 0 : AFTER_GRACE);
  const deps: CrazyGamesDeps = {
    getSdk: () => installed,
    loadSdkScript: vi.fn(async () => {
      installed = sdk;
      return opts.scriptLoads ?? sdk !== undefined;
    }),
    now: opts.now ?? pastGrace,
    onPauseChange: () => () => {},
  };
  // The session starts at createdAt = now() of the first call.
  return { runtime: createCrazyGamesRuntime(deps), deps };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SDK missing (blocked script)", () => {
  it("init resolves, every call is a no-op, saves go to localStorage, no ad is requested", async () => {
    let t = 0;
    const { runtime } = runtimeWith(undefined, { now: () => t });
    await expect(runtime.platform.init()).resolves.toBeUndefined();
    expect(() => {
      runtime.platform.loadingStart();
      runtime.platform.loadingStop();
      runtime.platform.gameplayStart();
      runtime.platform.gameplayStop();
      runtime.platform.happyMoment();
    }).not.toThrow();
    await runtime.platform.saveData("k", "42");
    expect(localStorage.getItem("k")).toBe("42");
    await expect(runtime.platform.loadData("k")).resolves.toBe("42");
    expect(runtime.platform.isAudioAllowed()).toBe(true);
    t = AFTER_GRACE + 1;
    await expect(runtime.ads.midgame()).resolves.toBe("unavailable");
    await expect(runtime.ads.rewarded()).resolves.toBe("unavailable");
  });

  it("a script that loads but defines no SDK fails over the same way", async () => {
    const { runtime } = runtimeWith(undefined, { scriptLoads: true });
    await runtime.platform.init();
    await runtime.platform.saveData("k", "7");
    await expect(runtime.platform.loadData("k")).resolves.toBe("7");
    await expect(runtime.ads.midgame()).resolves.toBe("unavailable");
  });
});

describe("SDK throwing", () => {
  it("init that throws: init still resolves and the game falls back", async () => {
    const { sdk } = fakeSdk();
    sdk.init.mockImplementation(() => {
      throw new Error("boom");
    });
    const { runtime } = runtimeWith(sdk);
    await expect(runtime.platform.init()).resolves.toBeUndefined();
    runtime.platform.gameplayStart();
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
    await runtime.platform.saveData("k", "3");
    expect(sdk.data.setItem).not.toHaveBeenCalled();
    await expect(runtime.platform.loadData("k")).resolves.toBe("3");
    await expect(runtime.ads.midgame()).resolves.toBe("unavailable");
  });

  it("init that rejects: same", async () => {
    const { sdk } = fakeSdk();
    sdk.init.mockRejectedValue(new Error("nope"));
    const { runtime } = runtimeWith(sdk);
    await expect(runtime.platform.init()).resolves.toBeUndefined();
    await expect(runtime.ads.midgame()).resolves.toBe("unavailable");
  });

  it("init that never settles times out instead of hanging", async () => {
    vi.useFakeTimers();
    const { sdk } = fakeSdk();
    sdk.init.mockImplementation(() => new Promise<void>(() => {}));
    const { runtime } = runtimeWith(sdk);
    const done = runtime.platform.init();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(done).resolves.toBeUndefined();
    runtime.platform.gameplayStart();
    expect(sdk.game.gameplayStart).not.toHaveBeenCalled();
  });

  it("every SDK method throwing after a good init never reaches the game", async () => {
    const { sdk } = fakeSdk();
    const boom = () => {
      throw new Error("sdk bug");
    };
    for (const key of ["loadingStart", "loadingStop", "gameplayStart", "gameplayStop", "happytime"] as const) {
      sdk.game[key].mockImplementation(boom);
    }
    sdk.data.getItem.mockImplementation(boom);
    sdk.data.setItem.mockImplementation(boom);
    sdk.ad.requestAd.mockImplementation(boom);
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    expect(() => {
      runtime.platform.loadingStart();
      runtime.platform.loadingStop();
      runtime.platform.gameplayStart();
      runtime.platform.gameplayStop();
      runtime.platform.happyMoment();
    }).not.toThrow();
    await expect(runtime.platform.saveData("k", "9")).resolves.toBeUndefined();
    await expect(runtime.platform.loadData("k")).resolves.toBe("9");
    await expect(runtime.ads.midgame()).resolves.toBe("error");
  });
});

describe("midgame ads", () => {
  it("adError resolves 'error', never 'finished', even if adFinished arrives later", async () => {
    const { sdk } = fakeSdk();
    let late: (() => void) | null = null;
    sdk.ad.requestAd.mockImplementation((_t, cb) => {
      cb.adStarted();
      cb.adError(new Error("no fill"));
      late = cb.adFinished;
    });
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    const onStart = vi.fn();
    const outcome = await runtime.ads.midgame({ onStart });
    expect(outcome).toBe("error");
    expect(onStart).toHaveBeenCalledTimes(1);
    late!();
    expect(sdk.ad.requestAd).toHaveBeenCalledWith("midgame", expect.any(Object));
  });

  it("adError before adStarted: 'error' and onStart (the mute) never fires", async () => {
    const { sdk } = fakeSdk();
    sdk.ad.requestAd.mockImplementation((_t, cb) => cb.adError("blocked"));
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    const onStart = vi.fn();
    await expect(runtime.ads.midgame({ onStart })).resolves.toBe("error");
    expect(onStart).not.toHaveBeenCalled();
  });

  it("a rejected requestAd promise is an error", async () => {
    const { sdk } = fakeSdk();
    sdk.ad.requestAd.mockImplementation(() => Promise.reject(new Error("x")) as never);
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    await expect(runtime.ads.midgame()).resolves.toBe("error");
  });

  it("adFinished after adStarted resolves 'finished'", async () => {
    const { sdk } = fakeSdk();
    sdk.ad.requestAd.mockImplementation((_t, cb) => {
      cb.adStarted();
      cb.adFinished();
    });
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    await expect(runtime.ads.midgame()).resolves.toBe("finished");
  });

  it("an ad that never starts settles as 'error' after the start timeout", async () => {
    vi.useFakeTimers();
    const { sdk } = fakeSdk();
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    const outcome = runtime.ads.midgame();
    await vi.advanceTimersByTimeAsync(AD_START_TIMEOUT_MS + 1);
    await expect(outcome).resolves.toBe("error");
  });

  it("is suppressed during the first 3 minutes of the session, then requested", async () => {
    const { sdk } = fakeSdk();
    sdk.ad.requestAd.mockImplementation((_t, cb) => cb.adFinished());
    let t = 1_000;
    const { runtime } = runtimeWith(sdk, { now: () => t });
    await runtime.platform.init();
    t = 1_000 + MIDGAME_GRACE_MS - 1;
    await expect(runtime.ads.midgame()).resolves.toBe("unavailable");
    expect(sdk.ad.requestAd).not.toHaveBeenCalled();
    t = 1_000 + MIDGAME_GRACE_MS;
    await expect(runtime.ads.midgame()).resolves.toBe("finished");
    expect(sdk.ad.requestAd).toHaveBeenCalledTimes(1);
  });

  it("requests at every break after the grace period (no cooldown of our own)", async () => {
    const { sdk } = fakeSdk();
    sdk.ad.requestAd.mockImplementation((_t, cb) => cb.adFinished());
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    await runtime.ads.midgame();
    await runtime.ads.midgame();
    await runtime.ads.midgame();
    expect(sdk.ad.requestAd).toHaveBeenCalledTimes(3);
  });

  it("rewarded is out of scope: always unavailable, never requested", async () => {
    const { sdk } = fakeSdk();
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    await expect(runtime.ads.rewarded()).resolves.toBe("unavailable");
    expect(sdk.ad.requestAd).not.toHaveBeenCalled();
  });
});

describe("lifecycle", () => {
  it("queues calls made before init and replays them in order once it resolves", async () => {
    const { sdk, calls } = fakeSdk();
    const { runtime } = runtimeWith(sdk);
    runtime.platform.loadingStart();
    runtime.platform.loadingStop();
    runtime.platform.gameplayStart();
    expect(calls).toEqual([]);
    await runtime.platform.init();
    expect(calls).toEqual(["init", "loadingStart", "loadingStop", "gameplayStart"]);
    runtime.platform.gameplayStop();
    expect(calls.at(-1)).toBe("gameplayStop");
  });

  it("happyMoment is happytime", async () => {
    const { sdk } = fakeSdk();
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    runtime.platform.happyMoment();
    expect(sdk.game.happytime).toHaveBeenCalledTimes(1);
  });

  it("init is idempotent: one script load, one SDK.init", async () => {
    const { sdk } = fakeSdk();
    const { runtime, deps } = runtimeWith(sdk);
    await Promise.all([runtime.platform.init(), runtime.platform.init()]);
    await runtime.platform.init();
    expect(deps.loadSdkScript).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("muteAudio drives isAudioAllowed and notifies subscribers", async () => {
    const { sdk, emitSettings } = fakeSdk();
    sdk.game.settings.muteAudio = true;
    const { runtime } = runtimeWith(sdk);
    const seen: boolean[] = [];
    runtime.platform.onAudioAllowedChange((a) => seen.push(a));
    await runtime.platform.init();
    expect(runtime.platform.isAudioAllowed()).toBe(false);
    emitSettings({ muteAudio: false });
    expect(runtime.platform.isAudioAllowed()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it("saves through SDK.data when available, and still reads a best saved locally while blocked", async () => {
    const { sdk, store } = fakeSdk();
    localStorage.setItem("old", "5");
    const { runtime } = runtimeWith(sdk);
    await runtime.platform.init();
    await runtime.platform.saveData("k", "11");
    expect(store.get("k")).toBe("11");
    await expect(runtime.platform.loadData("k")).resolves.toBe("11");
    await expect(runtime.platform.loadData("old")).resolves.toBe("5");
  });
});
