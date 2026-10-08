import { Capacitor } from "@capacitor/core";
import { targetConfig } from "@target/config";
import { getFreshToken } from "./firebaseAuth";

/**
 * The bundled app has no origin of its own, so every API call is absolute to
 * the Doomstack backend. With `CapacitorHttp` enabled (capacitor.config.ts),
 * the global `fetch` is patched on-device to use native HTTP — bypassing
 * browser CORS and letting us attach a cross-origin Bearer token.
 *
 * In the browser dev server this base still points at prod; cross-origin calls
 * there are expected to be blocked by CORS until a dev proxy is added — device
 * builds are the real target.
 *
 * The build target picks the base (targets/types.ts apiBase): same-origin for
 * a build served from doomstack.lol, Discord's proxy prefix inside Discord.
 */
const TARGET_API_BASE = targetConfig.apiBase;

/** The public site: share links, profile pages, deep-link host checks. */
export const SITE_ORIGIN = "https://www.doomstack.lol";

/**
 * Where `/api/...` calls go. Throws for a target that declares no API (the
 * portals), so a stray call fails loudly in development instead of leaking a
 * network request into a portal build.
 */
export function apiBase(): string {
  if (TARGET_API_BASE === null) throw new Error(`Target "${targetConfig.id}" makes no API calls`);
  return TARGET_API_BASE;
}

export const isNative = Capacitor.isNativePlatform();

/** Absolute API URL for a `/api/...`-style path. */
export function apiUrl(path: string): string {
  return `${apiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** fetch against the Doomstack API, attaching a fresh Bearer token. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getFreshToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl(path), { ...init, headers });
}

export interface ClimbSaveResult {
  saved: boolean;
  improved?: boolean;
  rank?: number;
  totalClimbers?: number;
  handle?: string;
}

/**
 * POST a finished climb to the leaderboard. Best-effort and guest-safe: with
 * no signed-in token the server won't persist, mirroring the web behavior.
 */
export async function postClimbResult(run: object): Promise<ClimbSaveResult> {
  try {
    const res = await apiFetch("/api/climb/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    if (!res.ok) return { saved: false };
    const data = await res.json();
    return {
      saved: Boolean(data.saved),
      improved: Boolean(data.improved),
      rank: typeof data.rank === "number" ? data.rank : undefined,
      totalClimbers:
        typeof data.totalClimbers === "number" ? data.totalClimbers : undefined,
      handle: typeof data.handle === "string" ? data.handle : undefined,
    };
  } catch {
    return { saved: false };
  }
}
