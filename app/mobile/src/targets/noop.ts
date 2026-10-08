/**
 * Adapters for targets with no host SDK (the native app, itch.io, local dev).
 * Saves go to localStorage; there are no ads; audio is always allowed and the
 * page's own visibility drives pause.
 */

import type { AdsAdapter, PlatformAdapter } from "./types";

/** localStorage read that never throws (private mode, blocked storage). */
export function localLoad(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage write that never throws. */
export function localSave(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the save is lost, the game carries on.
  }
}

export const noopPlatform: PlatformAdapter = {
  init: async () => {},
  loadingStart: () => {},
  loadingStop: () => {},
  gameplayStart: () => {},
  gameplayStop: () => {},
  happyMoment: () => {},
  loadData: async (key) => localLoad(key),
  saveData: async (key, value) => localSave(key, value),
  isAudioAllowed: () => true,
  onAudioAllowedChange: () => () => {},
  onPauseChange: (cb) => {
    if (typeof document === "undefined") return () => {};
    const onVis = () => cb(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  },
};

export const noAds: AdsAdapter = {
  enabled: false,
  midgame: async () => "unavailable",
  rewarded: async () => "unavailable",
};
