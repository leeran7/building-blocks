/**
 * The launch splash (mobile/src/lib/launchSplash.ts) holds until the level
 * map has its season, so opening the app never shows "Loading levels…".
 *
 * @vitest-environment happy-dom
 */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const splash = vi.hoisted(() => ({ hide: vi.fn(async () => {}), native: true }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => splash.native } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: () => splash.hide() } }));

import { LAUNCH_SPLASH_MAX_MS, launchReady, useLaunchSplash } from "../../mobile/src/lib/launchSplash";

const BASE = { authLoading: false, authed: true, seasonLoaded: false, seasonError: false };

describe("launchReady", () => {
  it("waits for auth", () => {
    expect(launchReady({ ...BASE, authLoading: true, seasonLoaded: true })).toBe(false);
    expect(launchReady({ ...BASE, authLoading: true, authed: false })).toBe(false);
  });

  it("is ready signed out as soon as auth resolves", () => {
    expect(launchReady({ ...BASE, authed: false })).toBe(true);
  });

  it("waits signed in until the season has loaded or failed", () => {
    expect(launchReady(BASE)).toBe(false);
    expect(launchReady({ ...BASE, seasonLoaded: true })).toBe(true);
    expect(launchReady({ ...BASE, seasonError: true })).toBe(true);
  });
});

describe("useLaunchSplash", () => {
  let seen: boolean[] = [];
  let root: ReturnType<typeof createRoot>;
  function Probe({ ready }: { ready: boolean }) {
    seen.push(useLaunchSplash(ready));
    return null;
  }
  const render = (ready: boolean) => act(() => root.render(createElement(Probe, { ready })));

  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
    splash.hide.mockClear();
    splash.native = true;
    root = createRoot(document.createElement("div"));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("keeps the native splash up until ready, then hides it once and stays launched", () => {
    render(false);
    expect(seen.at(-1)).toBe(false);
    expect(splash.hide).not.toHaveBeenCalled();
    render(true);
    expect(seen.at(-1)).toBe(true);
    expect(splash.hide).toHaveBeenCalledTimes(1);
    // A later reload (season cleared) does not bring the splash back.
    render(false);
    expect(seen.at(-1)).toBe(true);
    expect(splash.hide).toHaveBeenCalledTimes(1);
  });

  it("gives up waiting after LAUNCH_SPLASH_MAX_MS", () => {
    render(false);
    act(() => vi.advanceTimersByTime(LAUNCH_SPLASH_MAX_MS - 1));
    expect(seen.at(-1)).toBe(false);
    expect(splash.hide).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(seen.at(-1)).toBe(true);
    expect(splash.hide).toHaveBeenCalledTimes(1);
  });

  it("never calls the native plugin on the web", () => {
    splash.native = false;
    render(true);
    expect(seen.at(-1)).toBe(true);
    expect(splash.hide).not.toHaveBeenCalled();
  });
});
