/**
 * Every screen, sheet and page the UX checks visit. A new route or sheet gets
 * its row here in the same change (plan "Doomstack to 8/10": every page must
 * meet the bar, so every page must be checked).
 *
 * `open` takes the page from the route to the surface (a sheet, a sub-screen)
 * with real taps, the way a player gets there. `ready` is what must be on
 * screen before the checks run, so a blank or crashed page fails instead of
 * passing with nothing to check.
 */

import type { Locator, Page } from "@playwright/test";
import type { AppUser } from "./lib/app";
import type { FlowProblem } from "./lib/flow";

export interface Surface {
  id: string;
  kind: "app" | "web";
  route: string;
  /** App only: who is using the app. */
  user?: AppUser;
  /** Web only: the HTTP status the page must answer with (default 200). */
  status?: number;
  open?: (page: Page) => Promise<void>;
  ready: (page: Page) => Locator;
}

const heading = (name: RegExp) => (page: Page) => page.getByRole("heading", { name });
const button = (name: RegExp) => (page: Page) => page.getByRole("button", { name });
const dialog = (name: RegExp) => (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name }) });

const tapButton = (name: RegExp | string) => async (page: Page) => {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(1200);
};

export const APP_SURFACES: Surface[] = [
  { id: "signin", kind: "app", route: "/", user: "signed-out", ready: button(/continue as guest/i) },
  { id: "signin-email", kind: "app", route: "/", user: "signed-out", open: tapButton(/sign in with email/i), ready: heading(/^sign in$/i) },
  { id: "guest-home", kind: "app", route: "/", user: "guest", ready: button(/^play level 1$/i) },
  { id: "map", kind: "app", route: "/", user: "signed-in", ready: button(/^play level 1$/i) },
  { id: "xp-sheet", kind: "app", route: "/", user: "signed-in", open: tapButton(/^tier \d/i), ready: dialog(/^earn xp$/i) },
  { id: "versus-sheet", kind: "app", route: "/", user: "signed-in", open: tapButton(/^versus$/i), ready: dialog(/^versus$/i) },
  { id: "chest-sheet", kind: "app", route: "/", user: "signed-in", open: tapButton(/show your boosters/i), ready: dialog(/^star chest$/i) },
  { id: "level-sheet", kind: "app", route: "/", user: "signed-in", open: tapButton(/^level 1, next to play$/i), ready: dialog(/^level 1$/i) },
  {
    id: "level-intro",
    kind: "app",
    route: "/",
    user: "signed-in",
    open: async (page) => {
      // The map's PLAY starts level 1 itself; a new player's tutorial comes first.
      await tapButton(/^play level 1$/i)(page);
    },
    ready: dialog(/^how to climb$/i),
  },
  { id: "endless", kind: "app", route: "/climb", user: "signed-in", ready: heading(/^climb$/i) },
  { id: "daily", kind: "app", route: "/climb?daily=1", user: "signed-in", ready: heading(/^today.s tower$/i) },
  { id: "training", kind: "app", route: "/tutorial", user: "signed-in", ready: heading(/outclimb the lava/i) },
  { id: "shop", kind: "app", route: "/shop", user: "signed-in", ready: heading(/^shop$/i) },
  { id: "gem-sheet", kind: "app", route: "/shop", user: "signed-in", open: tapButton(/^get gems$/i), ready: dialog(/^get gems$/i) },
  { id: "skin-details", kind: "app", route: "/shop/kestrel", user: "signed-in", ready: heading(/^void kestrel$/i) },
  { id: "profile", kind: "app", route: "/profile", user: "signed-in", ready: heading(/^profile$/i) },
  { id: "profile-edit", kind: "app", route: "/profile/edit", user: "signed-in", ready: heading(/^edit profile$/i) },
  { id: "avatar-picker", kind: "app", route: "/profile/avatar", user: "signed-in", ready: heading(/^choose character$/i) },
  { id: "settings", kind: "app", route: "/settings", user: "signed-in", ready: heading(/^settings$/i) },
  { id: "leaderboard", kind: "app", route: "/leaderboard", user: "signed-in", ready: heading(/^leaderboard$/i) },
  { id: "challenge", kind: "app", route: "/challenge", user: "signed-in", ready: heading(/^challenge$/i) },
];

/** Each page with the heading it must show (its h1). */
const WEB_PAGES: [route: string, h1: RegExp][] = [
  ["/", /climb\.\s*or get\s*buried/i],
  ["/auth/signin", /^welcome back$/i],
  ["/auth/signup", /^create account$/i],
  ["/auth/reset-password", /^reset your password$/i],
  ["/play", /^play the climb$/i],
  ["/climb", /^global leaderboard$/i],
  ["/daily", /^daily climb$/i],
  ["/duel", /^1v1 arena$/i],
  ["/duel/chips", /^chip duels$/i],
  ["/duel/leaderboard", /^1v1 leaderboard$/i],
  ["/tournaments", /^tournaments$/i],
  ["/rules", /^rules$/i],
  ["/terms", /^terms of service$/i],
  ["/privacy", /^privacy policy$/i],
  ["/beta", /^join the beta$/i],
  // Signed out, as the checks run: the sign-in state.
  ["/account/payout", /^tournament payouts$/i],
  ["/auth/verify-email", /^check your inbox$/i],
];

export const WEB_SURFACES: Surface[] = [
  ...WEB_PAGES.map(([route, h1]) => ({
    id: route === "/" ? "home" : route.slice(1).replaceAll("/", "-"),
    kind: "web" as const,
    route,
    ready: heading(h1),
  })),
  // Any unknown path: the site's own 404 page.
  { id: "not-found", kind: "web", route: "/no-such-page", status: 404, ready: heading(/^page not found$/i) },
];

/** The flows in flows.spec.ts, by the id their baseline key uses. */
export const FLOW_IDS = [
  "app-guest-to-signin",
  "app-run-start",
  "app-out-of-lives",
  "app-buy-gems",
  "app-daily",
  "app-challenge",
  "web-hero-to-play",
] as const;

/** Flows broken on main today, each with the plan step that fixes it ("Doomstack to 8/10"). */
export const KNOWN_BROKEN: Partial<Record<(typeof FLOW_IDS)[number], { problem: FlowProblem; fix: string }[]>> = {};

