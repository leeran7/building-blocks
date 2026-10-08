/**
 * Telegram chrome around the app: ready / expand, no swipe-to-close while
 * climbing, Telegram's header and background in the game's void colour, the
 * Telegram BackButton driving router back on pushed screens, and external
 * links through WebApp.openLink (a Mini App must not navigate itself away).
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isTabRoot } from "../../components/BottomNav";
import { parentRoute, useBackOr } from "../../lib/navigation";
import type { TelegramWebApp } from "./webApp";

/** The app's void background (styles.css --color-void), for Telegram's own chrome. */
export const VOID_COLOR = "#0a0a0c";

/** Hex colours in setHeaderColor arrived in 6.9; setBottomBarColor in 7.10. */
const HEX_HEADER_VERSION = "6.9";
const BOTTOM_BAR_VERSION = "7.10";

function atLeast(app: TelegramWebApp, version: string): boolean {
  try {
    return app.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** Swallow a call an older Telegram client does not support. */
function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    // Unsupported in this Telegram version: the default chrome stays.
  }
}

/** One-time setup once the WebApp script is in: tell Telegram we're ready and take the full height. */
export function prepareTelegramChrome(app: TelegramWebApp): void {
  attempt(() => app.ready());
  attempt(() => app.expand());
  // A downward drag is a game move, not "close the Mini App".
  attempt(() => app.disableVerticalSwipes?.());
  attempt(() => app.setBackgroundColor?.(VOID_COLOR));
  if (atLeast(app, HEX_HEADER_VERSION)) attempt(() => app.setHeaderColor?.(VOID_COLOR));
  if (atLeast(app, BOTTOM_BAR_VERSION)) attempt(() => app.setBottomBarColor?.(VOID_COLOR));
}

/** The URL if it must leave the Mini App (http or https on another origin), else null. */
export function externalUrl(raw: string, origin: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin === origin ? null : url;
}

/** Open `url` the Telegram way: t.me links inside Telegram, anything else in the browser. */
function openOutside(app: TelegramWebApp, url: URL): void {
  attempt(() => (url.host === "t.me" ? app.openTelegramLink(url.href) : app.openLink(url.href)));
}

/**
 * Route window.open and clicks on external <a> links through Telegram while
 * the app runs (lib/external.ts opens Privacy, profile pages and checkout with
 * window.open). Returns the undo.
 */
export function routeExternalLinks(app: TelegramWebApp): () => void {
  const origin = window.location.origin;
  const originalOpen = window.open;
  window.open = (target?: string | URL, name?: string, features?: string) => {
    const url = target === undefined ? null : externalUrl(String(target), origin);
    if (url === null) return originalOpen.call(window, target, name, features);
    openOutside(app, url);
    return null;
  };
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = externalUrl(anchor.href, origin);
    if (url === null) return;
    e.preventDefault();
    openOutside(app, url);
  };
  document.addEventListener("click", onClick, true);
  return () => {
    window.open = originalOpen;
    document.removeEventListener("click", onClick, true);
  };
}

/**
 * Telegram's BackButton: shown on pushed screens (anything but a tab root),
 * where it goes back like the screen's own Back; hidden on Play, Shop and
 * Profile, where Telegram's Close takes its place. Render inside the router.
 */
export function useTelegramBackButton(app: TelegramWebApp): void {
  const { pathname } = useLocation();
  const back = useBackOr(parentRoute(pathname));
  const pushed = !isTabRoot(pathname);
  useEffect(() => {
    const button = app.BackButton;
    if (!pushed) {
      attempt(() => button.hide());
      return;
    }
    attempt(() => button.onClick(back));
    attempt(() => button.show());
    return () => attempt(() => button.offClick(back));
  }, [app, pushed, back]);
}
