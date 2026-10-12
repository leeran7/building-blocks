/**
 * Inside Discord an Activity may only talk to its own origin,
 * https://<client_id>.discordsays.com. Discord's proxy forwards
 * /.proxy/<prefix>/... to the target of each URL mapping configured in the
 * Developer Portal (Activities > URL Mappings). Each entry below must exist
 * there with the same prefix (without "/.proxy") and target.
 *
 * Our own API needs no patching: apiBase "/.proxy" (config.ts) makes every
 * /api/... call /.proxy/api/..., which the "/api" mapping sends to
 * www.doomstack.lol/api. These mappings cover the hosts other code calls with
 * absolute URLs: Firebase Auth (sign-in with the custom token, ID token
 * refresh) and Ably (duels: REST, the WebSocket, fallback hosts and its
 * connectivity check). patchUrlMappings rewrites fetch, XMLHttpRequest and
 * WebSocket so those calls go through the proxy.
 */

import { patchUrlMappings } from "@discord/embedded-app-sdk";

/** One Discord URL mapping: requests to `prefix` on the Activity origin go to `target`. */
export interface Mapping {
  prefix: string;
  target: string;
}

/** Third-party hosts the Activity calls with absolute URLs: portal prefix -> target. */
export const THIRD_PARTY_URL_MAPPINGS: readonly Mapping[] = [
  { prefix: "/firebase-auth", target: "identitytoolkit.googleapis.com" },
  { prefix: "/firebase-token", target: "securetoken.googleapis.com" },
  // No prefix is a string prefix of another ("/ably" would shadow "/ably-a").
  { prefix: "/ably-main", target: "main.realtime.ably.net" },
  { prefix: "/ably-a", target: "main.a.fallback.ably-realtime.com" },
  { prefix: "/ably-b", target: "main.b.fallback.ably-realtime.com" },
  { prefix: "/ably-c", target: "main.c.fallback.ably-realtime.com" },
  { prefix: "/ably-d", target: "main.d.fallback.ably-realtime.com" },
  { prefix: "/ably-e", target: "main.e.fallback.ably-realtime.com" },
  { prefix: "/ably-up", target: "internet-up.ably-realtime.com" },
];

/**
 * Every mapping the Developer Portal needs. "/" serves the bundle (hosting.cjs)
 * and "/api" our API; neither is patched on the client (the bundle's assets
 * and apiBase are already relative to the Activity's origin).
 */
export const PORTAL_URL_MAPPINGS: readonly Mapping[] = [
  { prefix: "/", target: "www.doomstack.lol/play/discord" },
  { prefix: "/api", target: "www.doomstack.lol/api" },
  ...THIRD_PARTY_URL_MAPPINGS,
];

/** The third-party mappings as the client patches them: under Discord's /.proxy path. */
export const CLIENT_URL_MAPPINGS: readonly Mapping[] = THIRD_PARTY_URL_MAPPINGS.map((m) => ({
  prefix: `/.proxy${m.prefix}`,
  target: m.target,
}));

/** True when the page was launched by Discord (it always passes frame_id). */
export function launchedByDiscord(search: string): boolean {
  return new URLSearchParams(search).has("frame_id");
}

let installed = false;

/**
 * Route absolute calls through Discord's proxy. Runs on import, before any
 * other module of the bundle evaluates (root.tsx imports this first), so
 * Firebase and Ably only ever see the patched fetch, XHR and WebSocket. Does
 * nothing outside Discord.
 */
export function installUrlMappings(): void {
  if (installed || typeof window === "undefined" || !launchedByDiscord(window.location.search)) return;
  installed = true;
  patchUrlMappings([...CLIENT_URL_MAPPINGS]);
}

installUrlMappings();
