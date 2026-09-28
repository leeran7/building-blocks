import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * The launch splash stays up until the first screen has what it needs, so
 * opening the app goes straight from the splash to the level map instead of
 * through a "Loading levels…" screen. The native splash (capacitor.config
 * keeps it up until told) and the in-app logo splash (web) both follow it.
 */

/** Longest the launch splash waits, ms: past this the app shows whatever it has. */
export const LAUNCH_SPLASH_MAX_MS = 10_000;

export interface LaunchState {
  /** The first auth state has not resolved yet. */
  authLoading: boolean;
  /** A real (non-anonymous) account is signed in. */
  authed: boolean;
  /** The level season has loaded. */
  seasonLoaded: boolean;
  /** Loading the level season failed (the map shows its retry). */
  seasonError: boolean;
}

/**
 * Whether the first screen is ready: auth has resolved, and a signed-in
 * player's level season has loaded or failed. Signed out, Sign In is ready
 * as soon as auth is.
 */
export function launchReady(s: LaunchState): boolean {
  if (s.authLoading) return false;
  if (!s.authed) return true;
  return s.seasonLoaded || s.seasonError;
}

/**
 * Latches true once `ready` is (or LAUNCH_SPLASH_MAX_MS passes), and then
 * hides the native splash. Later reloads never bring the splash back.
 */
export function useLaunchSplash(ready: boolean, maxMs = LAUNCH_SPLASH_MAX_MS): boolean {
  const [launched, setLaunched] = useState(false);
  useEffect(() => {
    if (launched) return;
    if (ready) {
      setLaunched(true);
      return;
    }
    const timer = setTimeout(() => setLaunched(true), maxMs);
    return () => clearTimeout(timer);
  }, [ready, launched, maxMs]);
  useEffect(() => {
    if (launched && Capacitor.isNativePlatform()) void SplashScreen.hide();
  }, [launched]);
  return launched;
}
