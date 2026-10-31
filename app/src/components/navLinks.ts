/**
 * Shared navbar destinations. Kept out of Navbar.tsx so tests can assert the
 * contract without loading the client auth tree.
 */

/** The game itself — not the landing-page #free teaser. */
export const FREE_CLIMB_HREF = "/play";

/** Daily Climb — same tower for everyone each day, with a local streak. */
export const DAILY_HREF = "/daily";

/** Daily Climb standings for today's tower (same board as the mobile Ranks → Today tab). */
export const DAILY_LEADERBOARD_HREF = "/daily/leaderboard";

/** Endless all-time standings. */
export const ENDLESS_LEADERBOARD_HREF = "/climb";

/** 1v1 duel home — challenge a friend or queue for a random opponent. */
export const DUEL_HREF = "/duel";

/** Chip duels lobby — ranked non-cashable chip stakes. */
export const CHIP_DUELS_HREF = "/duel/chips";

/** 1v1 duel leaderboard. */
export const DUEL_LEADERBOARD_HREF = "/duel/leaderboard";

/** Tournaments list. */
export const TOURNAMENTS_HREF = "/tournaments";

/** Sign-in page. Append ?redirect=<path> to return user after auth. */
export const SIGNIN_HREF = "/auth/signin";

/** Sign-up page. */
export const SIGNUP_HREF = "/auth/signup";

/** User dashboard. */
export const DASHBOARD_HREF = "/dashboard";

/** Account settings. */
export const SETTINGS_HREF = "/settings";

export const PRIVACY_HREF = "/privacy";
export const TERMS_HREF = "/terms";
export const RULES_HREF = "/rules";

/** The three game modes the navbar links to. */
export type GameMode = "1v1" | "daily" | "endless";

/**
 * The mode a page belongs to, from its navbar breadcrumb, so the navbar can
 * mark that mode's link. Only the three mode breadcrumbs map; every other
 * page (Rules, Settings, Tournament…) marks none.
 */
export function modeForContext(contextLabel: string | undefined): GameMode | null {
  switch (contextLabel) {
    case "1v1":
      return "1v1";
    case "Daily Climb":
      return "daily";
    case "Endless":
      return "endless";
    default:
      return null;
  }
}
