/**
 * Web-client marker header.
 *
 * The browser app and the iOS (Capacitor) app share the same backend and the
 * same `/api/auth/sync` provisioning call. Leaderboard participation needs
 * explicit consent on iOS (App Store Guideline 5.1.2, collected via the native
 * LeaderboardConsentModal), but the web has no such store requirement — web
 * users join the public leaderboard as part of accepting Terms at sign-up.
 *
 * The web callers of /api/auth/sync (browser AuthContext + the sign-up page)
 * set this header so the server can grant leaderboard consent for web users.
 * The iOS client never sets it, so an unmarked request is treated as
 * consent-gated — the safe default that keeps the store obligation intact even
 * for older app builds. Because absence fails closed (no auto-consent), this is
 * a UX/compliance signal, not a security trust boundary.
 */
export const WEB_CLIENT_HEADER = "X-Doomstack-Client";
export const WEB_CLIENT_VALUE = "web";

/** True when the request carries the browser-app marker. */
export function isWebClient(headers: Headers): boolean {
  return headers.get(WEB_CLIENT_HEADER) === WEB_CLIENT_VALUE;
}
