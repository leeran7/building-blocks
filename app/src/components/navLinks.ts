/**
 * Shared navbar destinations. Kept out of Navbar.tsx so tests can assert the
 * contract without loading the client auth tree.
 */

/** The game itself — not the landing-page #free teaser. */
export const FREE_CLIMB_HREF = "/play";

/** 1v1 duel home — challenge a friend or queue for a random opponent. */
export const DUEL_HREF = "/duel";
