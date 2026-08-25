/**
 * Bridges Firebase's client-side session (IndexedDB) to a cookie the Edge
 * middleware can read.
 *
 * The /dashboard guard in middleware.ts does a presence-only check for the
 * `firebaseToken` cookie — it cannot read Firebase's IndexedDB session. Without
 * this cookie, a signed-in user is redirected back to /auth/signin on every
 * navigation (the "authentication keeps getting stuck" loop). Server-side
 * verification of the token still happens in requireAuth() on API routes.
 *
 * Not httpOnly by necessity: the Firebase client SDK already exposes this token
 * to JS; the cookie only carries presence for the middleware, and API routes
 * re-verify it.
 */

export const TOKEN_COOKIE = "firebaseToken";

export function setTokenCookie(idToken: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Presence-only cookie for the middleware (API routes verify the fresh token
  // from context). Outlives the ~1h token expiry so a hard reload of /dashboard
  // after an idle period isn't bounced; onIdTokenChanged re-sets it while active,
  // and signOut() clears it. 7-day window.
  document.cookie = `${TOKEN_COOKIE}=${idToken}; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function clearTokenCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
