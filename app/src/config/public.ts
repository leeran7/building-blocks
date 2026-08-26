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
  /** Canonical public origin (OG images, canonical URLs). */
  siteUrl: "https://doomstack.lol",

  /** Tower leaderboard poll interval (ms). */
  pollIntervalMs: 10000,

  /** Firebase web config — public identifiers, not secrets. */
  firebase: {
    apiKey: "AIzaSyCod-vHzZrsckdv9DV47u1KLxToqhzmsi4",
    authDomain: "building-blocks-88190.firebaseapp.com",
    projectId: "building-blocks-88190",
  },
} as const;
