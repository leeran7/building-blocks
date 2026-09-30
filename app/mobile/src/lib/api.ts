/// <reference path="../vite-env.d.ts" />
import { Capacitor } from "@capacitor/core";
import { getFreshToken } from "./firebaseAuth";

/** The production site. Deep links are only verified for this host. */
export const SITE_ORIGIN = "https://www.doomstack.lol";

/**
 * Preview builds (`pnpm cap:ios:preview`, Vite mode "preview") can point the
 * app at a Vercel preview deployment via VITE_API_BASE, plus
 * VITE_VERCEL_BYPASS (the project's "Protection Bypass for Automation" secret)
 * to get past Vercel's SSO protection on preview URLs. Both are ignored in
 * production-mode builds, so `pnpm cap:ios` / release archives always talk to
 * prod no matter what is in the shell environment. See mobile/README.md.
 */
const isPreviewBuild = import.meta.env.MODE !== "production";
const previewBase = isPreviewBuild ? import.meta.env.VITE_API_BASE?.replace(/\/+$/, "") : undefined;
const vercelBypass = isPreviewBuild ? import.meta.env.VITE_VERCEL_BYPASS : undefined;

/**
 * The bundled app has no origin of its own, so every API call is absolute to
 * the Doomstack backend. With `CapacitorHttp` enabled (capacitor.config.ts),
 * the global `fetch` is patched on-device to use native HTTP — bypassing
 * browser CORS and letting us attach a cross-origin Bearer token.
 *
 * In the browser dev server this base still points at prod; cross-origin calls
 * there are expected to be blocked by CORS until a dev proxy is added — device
 * builds are the real target.
 */
export const API_BASE = previewBase || SITE_ORIGIN;

/** True when this build talks to a non-production backend. */
export const IS_PREVIEW_BACKEND = API_BASE !== SITE_ORIGIN;

/** Adds the Vercel protection-bypass header on preview builds (no-op in prod). */
export function withPreviewHeaders(headers: Headers): Headers {
  if (vercelBypass && !headers.has("x-vercel-protection-bypass")) {
    headers.set("x-vercel-protection-bypass", vercelBypass);
  }
  return headers;
}

export const isNative = Capacitor.isNativePlatform();

/** Absolute API URL for a `/api/...`-style path. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** fetch against the Doomstack API, attaching a fresh Bearer token. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getFreshToken();
  const headers = withPreviewHeaders(new Headers(init.headers));
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
