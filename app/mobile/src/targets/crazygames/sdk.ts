/**
 * CrazyGames HTML5 SDK v3 adapters.
 *
 * The SDK is a script on CrazyGames' CDN, injected by init() so a blocked or
 * failed load costs nothing but the timeout. Every call is feature-checked and
 * guarded: with the SDK missing (ad blocker, offline, another host) the game
 * runs normally, saves go to localStorage and no ad is ever requested.
 *
 * Lifecycle calls made before SDK.init() has resolved are queued in order and
 * replayed once it has, so an early Start still reports gameplayStart (the
 * first one also measures the initial download).
 *
 * Docs: https://docs.crazygames.com/sdk/
 */

import type { AdCallbacks, AdOutcome, AdsAdapter, PlatformAdapter } from "../types";
import { localLoad, localSave } from "../noop";
import { safely, settleWithin } from "../../portal/sdkGuard";

export const CRAZYGAMES_SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
/** How long the SDK script may take to load before the game gives up on it. */
export const SCRIPT_TIMEOUT_MS = 8_000;
/** How long SDK.init() may take. */
export const INIT_TIMEOUT_MS = 8_000;
/** No midgame ad during the player's first 3 minutes of the session. */
export const MIDGAME_GRACE_MS = 3 * 60 * 1000;
/** A requested ad that has not started by then is treated as an error. */
export const AD_START_TIMEOUT_MS = 15_000;
/** Hard cap on one ad break, so a lost callback cannot block the game forever. */
export const AD_MAX_MS = 120_000;
/** Calls queued while the SDK loads; more than this means init never ran. */
const MAX_QUEUED = 64;

/** The slice of the CrazyGames v3 SDK this game uses. Every member is optional: trust nothing. */
export interface CrazySdk {
  init?: () => unknown;
  game?: {
    loadingStart?: () => void;
    loadingStop?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    happytime?: () => void;
    settings?: CrazySettings;
    addSettingsChangeListener?: (listener: (settings: CrazySettings) => void) => void;
  };
  ad?: {
    requestAd?: (type: "midgame" | "rewarded", callbacks: CrazyAdCallbacks) => unknown;
  };
  data?: {
    getItem?: (key: string) => unknown;
    setItem?: (key: string, value: string) => void;
  };
}

export interface CrazySettings {
  muteAudio?: boolean;
}

interface CrazyAdCallbacks {
  adStarted: () => void;
  adFinished: () => void;
  adError: (error: unknown) => void;
}

export interface CrazyGamesDeps {
  /** The SDK object once its script has run (window.CrazyGames.SDK). */
  getSdk: () => CrazySdk | undefined;
  /** Inject the SDK script. Resolves false when it failed or timed out. */
  loadSdkScript: () => Promise<boolean>;
  /** Clock for the midgame grace period. */
  now: () => number;
  /** Pause source: the page's own visibility (CrazyGames has no pause event). */
  onPauseChange: PlatformAdapter["onPauseChange"];
}

export interface CrazyGamesRuntime {
  platform: PlatformAdapter;
  ads: AdsAdapter;
}

type Status = "idle" | "loading" | "ready" | "failed";

export function createCrazyGamesRuntime(deps: CrazyGamesDeps): CrazyGamesRuntime {
  const sessionStart = deps.now();
  let status: Status = "idle";
  let sdk: CrazySdk | null = null;
  let initPromise: Promise<void> | null = null;
  let queue: Array<(s: CrazySdk) => void> = [];
  let audioAllowed = true;
  const audioListeners = new Set<(allowed: boolean) => void>();

  /** Run `fn` against the SDK now, after init, or never if it failed. */
  function call(fn: (s: CrazySdk) => void): void {
    if (status === "ready" && sdk) {
      const ready = sdk;
      safely(() => fn(ready), undefined);
      return;
    }
    if (status === "failed" || queue.length >= MAX_QUEUED) return;
    queue.push(fn);
  }

  function setAudioAllowed(next: boolean): void {
    if (next === audioAllowed) return;
    audioAllowed = next;
    audioListeners.forEach((cb) => safely(() => cb(next), undefined));
  }

  function becomeReady(s: CrazySdk): void {
    sdk = s;
    status = "ready";
    const pending = queue;
    queue = [];
    pending.forEach((fn) => safely(() => fn(s), undefined));
    setAudioAllowed(safely(() => s.game?.settings?.muteAudio !== true, true));
    safely(
      () =>
        s.game?.addSettingsChangeListener?.((settings) => {
          setAudioAllowed(settings?.muteAudio !== true);
        }),
      undefined,
    );
  }

  function fail(): void {
    status = "failed";
    queue = [];
  }

  async function boot(): Promise<void> {
    status = "loading";
    if (!safely(deps.getSdk, undefined)) {
      const loaded = await deps.loadSdkScript().catch(() => false);
      if (!loaded) return fail();
    }
    const s = safely(deps.getSdk, undefined);
    if (!s) return fail();
    if (typeof s.init === "function") {
      const init = s.init;
      const result = await settleWithin(() => init.call(s), INIT_TIMEOUT_MS);
      if (!result.ok) return fail();
    }
    becomeReady(s);
  }

  /** The SDK once init has settled, or null when it is unavailable. */
  async function readySdk(): Promise<CrazySdk | null> {
    if (initPromise) await initPromise;
    return status === "ready" ? sdk : null;
  }

  const platform: PlatformAdapter = {
    init() {
      if (!initPromise) initPromise = boot().catch(fail);
      return initPromise;
    },
    loadingStart: () => call((s) => s.game?.loadingStart?.()),
    loadingStop: () => call((s) => s.game?.loadingStop?.()),
    gameplayStart: () => call((s) => s.game?.gameplayStart?.()),
    gameplayStop: () => call((s) => s.game?.gameplayStop?.()),
    happyMoment: () => call((s) => s.game?.happytime?.()),
    async loadData(key) {
      const s = await readySdk();
      const fromSdk = s ? safely(() => s.data?.getItem?.(key), undefined) : undefined;
      // A best saved while the SDK was blocked lives in localStorage only.
      return typeof fromSdk === "string" ? fromSdk : localLoad(key);
    },
    async saveData(key, value) {
      localSave(key, value);
      const s = await readySdk();
      if (s) safely(() => s.data?.setItem?.(key, value), undefined);
    },
    isAudioAllowed: () => audioAllowed,
    onAudioAllowedChange(cb) {
      audioListeners.add(cb);
      return () => {
        audioListeners.delete(cb);
      };
    },
    onPauseChange: (cb) => safely(() => deps.onPauseChange(cb), () => {}),
  };

  const ads: AdsAdapter = {
    enabled: true,
    async midgame(cb) {
      if (deps.now() - sessionStart < MIDGAME_GRACE_MS) return "unavailable";
      const s = status === "ready" ? sdk : null;
      const requestAd = s?.ad?.requestAd;
      if (!s || typeof requestAd !== "function") return "unavailable";
      return requestMidgame((callbacks) => requestAd.call(s.ad, "midgame", callbacks), cb);
    },
    // Rewarded ads (and the revive they would pay for) are out of scope.
    rewarded: async () => "unavailable",
  };

  return { platform, ads };
}

/**
 * One midgame request. "finished" only on adFinished; adError, a throw, a
 * rejected promise, no start within AD_START_TIMEOUT_MS or no end within
 * AD_MAX_MS are all "error". Whatever settles first wins; later callbacks are
 * ignored, so a late adStarted never mutes a game that already resumed.
 */
function requestMidgame(
  request: (callbacks: CrazyAdCallbacks) => unknown,
  cb: AdCallbacks | undefined,
): Promise<AdOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    const startTimer = setTimeout(() => {
      if (!started) settle("error");
    }, AD_START_TIMEOUT_MS);
    const capTimer = setTimeout(() => settle("error"), AD_MAX_MS);
    function settle(outcome: AdOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      clearTimeout(capTimer);
      resolve(outcome);
    }
    try {
      const pending = request({
        adStarted: () => {
          if (settled || started) return;
          started = true;
          clearTimeout(startTimer);
          safely(() => cb?.onStart?.(), undefined);
        },
        adFinished: () => settle("finished"),
        adError: () => settle("error"),
      });
      if (isThenable(pending)) pending.then(undefined, () => settle("error"));
    } catch {
      settle("error");
    }
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}
