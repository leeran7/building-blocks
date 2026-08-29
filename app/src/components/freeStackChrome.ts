/**
 * Free-stack chrome contracts used by FreeStackShell and the climb board.
 *
 * Kept out of the React trees so unit tests can invoke them without loading
 * Navbar (client auth) or ClimbControlsGuide (coarse-pointer hook).
 */

export function isFillSection(section: FreeStackSection): boolean {
  return section === "play";
}

/** Wins count and peak `m` unit on ClimbLeaderboard — muted fails AA on surface. */
export const LEADERBOARD_UNIT_CLASS = "text-text-secondary";

/** Overlay guide labels and detail copy — muted fails AA on void at 10–11px. */
export const OVERLAY_GUIDE_COPY_CLASS = "text-text-secondary";

export type FreeStackSection = "leaderboard" | "play";
