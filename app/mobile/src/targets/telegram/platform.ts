/**
 * The Telegram host lifecycle (PlatformAdapter): the WebApp script, haptics,
 * pause on Telegram's deactivated / activated events or a hidden page, and
 * saves in Telegram CloudStorage (per user, across their devices) mirrored to
 * localStorage. Every method survives the script being blocked.
 */

import { localLoad, localSave } from "../noop";
import type { PlatformAdapter } from "../types";
import { currentWebApp, loadTelegramWebApp, type TelegramWebApp } from "./webApp";

/** CloudStorage arrived in Bot API 6.9; its key and value limits. */
const CLOUD_STORAGE_VERSION = "6.9";
const CLOUD_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const CLOUD_VALUE_MAX = 4096;

/** A CloudStorage read that hangs (no Telegram client answering) falls back after this. */
const CLOUD_TIMEOUT_MS = 3000;

function cloudFor(key: string, value?: string): NonNullable<TelegramWebApp["CloudStorage"]> | null {
  const app = currentWebApp();
  if (!app?.CloudStorage || !CLOUD_KEY.test(key)) return null;
  if (value !== undefined && value.length > CLOUD_VALUE_MAX) return null;
  try {
    return app.isVersionAtLeast(CLOUD_STORAGE_VERSION) ? app.CloudStorage : null;
  } catch {
    return null;
  }
}

function cloudLoad(key: string): Promise<string | null> {
  const cloud = cloudFor(key);
  if (cloud === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS);
    try {
      cloud.getItem(key, (err, value) => {
        window.clearTimeout(timer);
        // CloudStorage answers "" for a key it has never stored.
        resolve(err === null && typeof value === "string" && value !== "" ? value : null);
      });
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

function haptic(fn: (h: NonNullable<TelegramWebApp["HapticFeedback"]>) => void): void {
  const h = currentWebApp()?.HapticFeedback;
  if (!h) return;
  try {
    fn(h);
  } catch {
    // Older clients without haptics: nothing to feel.
  }
}

export const telegramPlatform: PlatformAdapter = {
  init: async () => {
    await loadTelegramWebApp();
  },
  loadingStart: () => {},
  loadingStop: () => {},
  gameplayStart: () => haptic((h) => h.impactOccurred("medium")),
  gameplayStop: () => {},
  happyMoment: () => haptic((h) => h.notificationOccurred("success")),
  loadData: async (key) => (await cloudLoad(key)) ?? localLoad(key),
  saveData: async (key, value) => {
    localSave(key, value);
    const cloud = cloudFor(key, value);
    if (cloud === null) return;
    try {
      cloud.setItem(key, value);
    } catch {
      // The local copy stands.
    }
  },
  isAudioAllowed: () => true,
  onAudioAllowedChange: () => () => {},
  onPauseChange: (cb) => {
    const onVis = () => cb(document.visibilityState === "hidden");
    const onDeactivated = () => cb(true);
    const onActivated = () => cb(false);
    document.addEventListener("visibilitychange", onVis);
    const app = currentWebApp();
    app?.onEvent("deactivated", onDeactivated);
    app?.onEvent("activated", onActivated);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      app?.offEvent("deactivated", onDeactivated);
      app?.offEvent("activated", onActivated);
    };
  },
};
