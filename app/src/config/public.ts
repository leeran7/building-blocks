/**
 * Public runtime config — consolidated JSON (formerly NEXT_PUBLIC_* env vars).
 *
 * Everything here is PUBLIC by design: it ships in the client bundle either way.
 * The Firebase web config and Stripe publishable key are public identifiers
 * (security is enforced by Firebase rules / server-side Stripe secret, not by
 * keeping these hidden). Kept in code so there's no NEXT_PUBLIC_* env to manage.
 *
 * To point at a different Firebase project or domain, edit the values here.
 */
export const PUBLIC_CONFIG = {
  /** Canonical public origin (OG images, canonical URLs) — prod. */
  siteUrl: "https://www.doomstack.lol",

  /** Tower leaderboard poll interval (ms). */
  pollIntervalMs: 10000,

  /** Firebase web config — public identifiers, not secrets. */
  firebase: {
    apiKey: "AIzaSyCod-vHzZrsckdv9DV47u1KLxToqhzmsi4",
    authDomain: "www.doomstack.lol",
    projectId: "building-blocks-88190",
  },
} as const;

/**
 * Resolve the origin for internal fetches, Stripe redirects, and OG/canonical
 * URLs. Localhost in dev; the prod domain in production. Prefers an explicit
 * BASE_URL env, then falls back to the canonical prod URL when NODE_ENV is
 * production — so prod is correct even if BASE_URL isn't set. No trailing slash.
 */
export function resolveBaseUrl(): string {
  const fromEnv = process.env.BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production"
    ? PUBLIC_CONFIG.siteUrl
    : "http://localhost:3000";
}
