/**
 * When an interstitial ad may show before "Play again" in Endless (the ads
 * plan, placement A). Shared by the iOS app (mobile ClimbScreen) and the web
 * /play page, so both pace ads the same way.
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
   * next run. A true answer is a request, not a show: report what happened
   * with `adShown`.
   */
  playAgain(now: number, adFree: boolean): boolean;
  /** An ad actually played (finished or skipped): start counting again. */
  adShown(): void;
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
    adShown() {
      presses = 0;
    },
  };
}
