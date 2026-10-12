import type { AdOutcome, AdsAdapter } from "../targets/types";

/**
 * The ad break before Play again: the one place a portal may show a midgame
 * ad (death screen, the player chose to play again). Resolves whatever the ad
 * does and never throws; the caller blocks input until it settles and then
 * starts the run whatever the outcome. `onStart` fires only once the ad is
 * actually playing, which is when audio goes silent.
 */
export async function requestBreak(ads: AdsAdapter, onStart: () => void): Promise<AdOutcome> {
  if (!ads.enabled) return "unavailable";
  try {
    return await ads.midgame({ onStart });
  } catch {
    return "error";
  }
}
