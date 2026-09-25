import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** react-router's key for the entry the router started on (no in-app history). */
const INITIAL_LOCATION_KEY = "default";

const HOME_ROUTE = "/";

/**
 * Where Back goes from a screen opened cold (no in-app entry behind it). Same
 * parents as the screens' own header Back; anything unlisted goes Home.
 */
const PARENT_ROUTES: ReadonlyMap<string, string> = new Map([
  ["/profile/edit", "/profile"],
  ["/profile/avatar", "/profile"],
  ["/challenge", HOME_ROUTE],
]);

export function parentRoute(pathname: string): string {
  return PARENT_ROUTES.get(pathname) ?? HOME_ROUTE;
}

/**
 * True when there is an in-app entry behind the current one, so `navigate(-1)`
 * stays inside the app. On a cold start or deep link (`#/settings`,
 * `#/profile/edit`) the first entry belongs to whatever was open before, and
 * going back to it leaves the app.
 *
 * The browser and hash routers store their own 0-based `idx` in
 * `history.state`; a `replace` (the /settings redirect) keeps it at 0 while
 * minting a new key, so `idx` is checked first. The memory router keeps
 * nothing in `history.state`, and its first entry has the "default" key.
 */
export function hasInAppHistory(locationKey: string): boolean {
  const state: unknown = window.history.state;
  if (typeof state === "object" && state !== null && "idx" in state && typeof state.idx === "number") {
    return state.idx > 0;
  }
  return locationKey !== INITIAL_LOCATION_KEY;
}

/**
 * Back for a pushed screen: pop when there is in-app history, otherwise
 * replace the current entry with `fallback` (the screen's parent) so Back
 * never exits the app.
 */
export function useBackOr(fallback: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (hasInAppHistory(key)) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [key, navigate, fallback]);
}
