/**
 * When an interstitial ad may show before "Play again" in Endless (the ads
 * plan, placement A), used by the iOS app's ClimbScreen. Kept outside the
 * mobile tree so any other target that shows this ad paces it the same way.
 *
 * Rules:
 *  - never in the player's first INTERSTITIAL_GRACE_MS of the session;
 *  - at most one every INTERSTITIAL_EVERY_RUNS presses of Play again;
 *  - never for a player who has paid for gems (`adFree`).
 * Daily, duels, levels and runs themselves never call this: they show no
 * interstitials at all.
 */

/** No interstitial in the first 3 minutes of a session (as on CrazyGames). */
export const INTERSTITIAL_GRACE_MS = 3 * 60 * 1000;
/** At most one interstitial per this many Play again presses. */
export const INTERSTITIAL_EVERY_RUNS = 3;

export interface InterstitialPacer {
  /**
   * Count one press of Play again and say whether to show an ad before the
   * next run. After a true answer, call `breakTried` once the ad settles.
   */
  playAgain(now: number, adFree: boolean): boolean;
  /**
   * An ad break was tried, whatever came of it: start counting again. A
   * break with no fill or a blocked SDK is not retried on the very next run,
   * so a player is never kept waiting on every press.
   */
  breakTried(): void;
}

export function createInterstitialPacer(sessionStart: number): InterstitialPacer {
  let presses = 0;
  return {
    playAgain(now, adFree) {
      presses += 1;
      if (adFree) return false;
      if (now - sessionStart < INTERSTITIAL_GRACE_MS) return false;
      return presses >= INTERSTITIAL_EVERY_RUNS;
    },
    breakTried() {
      presses = 0;
    },
  };
}
