import { API_BASE } from "./api";
import { getFreshToken } from "./firebaseAuth";

const _origFetch = globalThis.fetch;

/**
 * The bundled game engine (shared `@app/*` code) makes relative `/api/...`
 * fetches and sources its Bearer token from the Firebase JS SDK. On device we
 * sign in through the native Capacitor Firebase plugin, so the JS SDK's
 * `auth.currentUser` is null and those requests would go out unauthenticated —
 * the realtime-token and result endpoints then 403/401. We are the single choke
 * point every relative `/api/` call passes through, so rewrite the URL to the
 * backend AND attach a fresh native ID token (unless the caller already set one).
 *
 * Contract: only string inputs are intercepted. A `Request`/`URL` object with a
 * relative `/api/` path would skip both the rewrite and the token attach (and so
 * 403). No engine caller does this today — keep `/api/` fetches string-based.
 */
globalThis.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === "string" && input.startsWith("/api/")) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) {
      const token = await getFreshToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    return _origFetch.call(globalThis, `${API_BASE}${input}`, { ...init, headers });
  }
  return _origFetch.call(globalThis, input, init);
};
