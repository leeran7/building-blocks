/**
 * The Discord Activity's lifecycle adapter. Saves stay in localStorage (the
 * account's progress is on the server anyway) and audio is always allowed.
 * Pause follows the page's visibility, plus Discord's picture-in-picture
 * layout: when the player leaves the Activity for a chat, Discord shrinks it
 * to a tile and the game should stop.
 */

import { localLoad, localSave } from "../noop";
import type { PlatformAdapter } from "../types";

/** Discord's ACTIVITY_LAYOUT_MODE_UPDATE `layout_mode` for the small PIP tile. */
export const LAYOUT_MODE_PIP = 1;

/** The SDK's layout subscription, loaded lazily (a fake in tests). */
export interface LayoutSource {
  /** Subscribe to layout changes; resolves to the unsubscribe. */
  onLayoutMode(cb: (layoutMode: number) => void): Promise<() => void>;
}

export function createDiscordPlatform(loadLayout: () => Promise<LayoutSource | null>): PlatformAdapter {
  return {
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
    onPauseChange(cb) {
      let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      let pip = false;
      let last = hidden || pip;
      let stopped = false;
      const emit = () => {
        const paused = hidden || pip;
        if (paused !== last) {
          last = paused;
          cb(paused);
        }
      };
      const onVis = () => {
        hidden = document.visibilityState === "hidden";
        emit();
      };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

      let unsubscribeLayout: (() => void) | null = null;
      void loadLayout()
        .then((src) =>
          src?.onLayoutMode((mode) => {
            pip = mode === LAYOUT_MODE_PIP;
            emit();
          }),
        )
        .then((unsub) => {
          if (!unsub) return;
          if (stopped) unsub();
          else unsubscribeLayout = unsub;
        })
        .catch(() => {
          // No layout events (older client, missing permission): visibility alone drives pause.
        });

      return () => {
        stopped = true;
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
        unsubscribeLayout?.();
      };
    },
  };
}
