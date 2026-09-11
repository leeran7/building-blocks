/**
 * Shared navbar destinations. Kept out of Navbar.tsx so tests can assert the
 * contract without loading the client auth tree.
 */

/** The game itself — not the landing-page #free teaser. */
export const FREE_CLIMB_HREF = "/play";

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
