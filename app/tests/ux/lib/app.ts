/**
 * Opens the app SPA (mobile/, served by `pnpm mobile:dev`) in a test page
 * without a real account or the production API.
 *
 * - Sign-in: the Firebase module is swapped for a stub whose user is set by
 *   the test (signed in, signed out, or a guest on the device).
 * - API: calls to https://www.doomstack.lol are answered from FIXTURES. Any
 *   other /api path gets a 404 with `{}`, which makes the levels client use
 *   its built-in mock season.
 *
 * Balances and ranks are examples (120 gems, rank 37, no stars), so checks see
 * a new player's state, the one most likely to hit locked content.
 */

import type { Page } from "@playwright/test";

export const APP_URL = process.env.UX_APP_URL ?? "http://localhost:5174/index.html";

const AUTH_STUB = `
const u = window.__UX_AUTHED ? { uid: "ux-user", email: "climber@example.com", displayName: "Climber", isAnonymous: false, photoUrl: null } : null;
export async function onAuthChange(cb) { cb(u); return () => {}; }
export async function getFreshToken() { return u ? "ux-token" : null; }
export async function signInWithApple() { throw new Error("ux stub"); }
export async function signInWithGoogle() { throw new Error("ux stub"); }
export async function signInWithEmail() { throw new Error("ux stub"); }
export async function createAccountWithEmail() { throw new Error("ux stub"); }
export async function sendPasswordReset() { throw new Error("ux stub"); }
export async function signOut() {}
`;

export const CHECKOUT_URL = "https://checkout.example.test/ux";

const FIXTURES: Record<string, unknown> = {
  "/api/settings": {
    displayName: "Climber",
    username: "climber",
    social: null,
    leaderboardConsent: true,
    avatarId: null,
    // A new player past the tutorial: the stick figures, no star characters yet.
    avatarUnlocks: {
      stars: 0,
      tutorialDone: true,
      seasonDone: false,
      unlockedIds: ["stick-green", "stick-ember", "stick-amber", "stick-sky", "stick-violet", "stick-pink"],
      ownedIds: [],
      grandfatheredId: null,
    },
  },
  "/api/shop": { gems: 120, ownedIds: [], appleAccountToken: null, webCheckout: false },
  "/api/dashboard": {
    user: { id: "ux-user", email: "climber@example.com", username: "climber" },
    freeClimb: { peakY: 412, rank: 37, totalClimbers: 1290, wins: 4, handle: "climber" },
  },
  "/api/climb/leaderboard": { climbers: [], total: 0 },
  "/api/friends": { friends: [] },
  "/api/friends/requests": { incoming: [], outgoing: [] },
  "/api/challenge": [],
  "/api/gems/checkout": { checkoutUrl: CHECKOUT_URL },
};

/**
 * Aborts every request that leaves this machine, except the ones a test
 * answers itself with page.route (page routes run before context routes).
 * The checks must never reach production services such as Firebase or
 * Stripe, and pages must not depend on the network to render.
 */
export async function isolate(page: Page): Promise<void> {
  // On the context, so windows the page opens (checkout) are isolated too.
  await page.context().route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (r) => r.abort());
  // WebSockets (Firebase, live duels) don't go through route(); close them too.
  await page.context().routeWebSocket(/^wss?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (ws) => ws.close());
}

export type AppUser = "signed-in" | "signed-out" | "guest";

/** Prepares `page` (before its first navigation) to run the app as `user`. */
export async function prepareApp(
  page: Page,
  user: AppUser,
  opts: { onboarded?: boolean; outOfLives?: boolean } = {},
): Promise<void> {
  const onboarded = opts.onboarded ?? true;
  if (opts.outOfLives) {
    // The device-local level store (the app's fallback while the level routes
    // are not deployed): levels 1 to 10 cleared, every life spent on level 11.
    await page.addInitScript(() => {
      const progress: Record<string, { stars: number; bestMs: number }> = {};
      for (let level = 1; level <= 10; level++) progress[level] = { stars: 3, bestMs: 20_000 };
      const state = { progress, lives: 0, livesUpdatedAt: Date.now(), xp: 0, openTicket: null, streak: 0 };
      try {
        localStorage.setItem("doomstack:levels:mock:v1:ux-user", JSON.stringify(state));
      } catch {
        // No storage: the flow then starts with full lives and fails its check.
      }
    });
  }
  await page.addInitScript(
    ([authed, guest, onboarded]) => {
      (window as unknown as { __UX_AUTHED: boolean }).__UX_AUTHED = authed;
      try {
        if (onboarded) localStorage.setItem("doomstack:onboarding-done", "1");
        if (guest) localStorage.setItem("doomstack:guest", "1");
      } catch {
        // Storage can be unavailable; the app then starts as a new player.
      }
    },
    [user === "signed-in", user === "guest", onboarded] as const,
  );
  await isolate(page);
  await page.route(/\/lib\/firebaseAuth\.ts(\?.*)?$/, (r) => r.fulfill({ contentType: "application/javascript", body: AUTH_STUB }));
  await page.route("https://www.doomstack.lol/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/climb/daily") {
      // Today's daily tower, as GET /api/climb/daily returns it (example seed).
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ day, seed: "daily1-uxuxuxuxuxuxuxuxuxuxux", resetsAt }) });
    }
    if (Object.hasOwn(FIXTURES, path)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES[path]) });
    }
    return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.route(`${CHECKOUT_URL}**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Checkout</title>" }));
}

/** Opens an app route (a hash path such as "/shop") and waits for it to settle. */
export async function openApp(page: Page, route: string): Promise<void> {
  await page.goto(`${APP_URL}#${route}`);
  // The launch splash holds until the level season loads, then screens fade in.
  await page.waitForTimeout(3500);
}
