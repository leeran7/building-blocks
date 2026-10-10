import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";
import { createYouTubePlatform, type YtGame } from "./sdk";

interface YtWindow {
  ytgame?: YtGame;
}

/** YouTube Playables: endless Free Climb only, the Playables SDK (head.html), no ads. */
export const targetConfig: TargetConfig = {
  id: "youtube",
  name: "Doomstack",
  features: { signIn: false, shop: false, duels: false, leaderboard: false, daily: false, levels: false },
  apiBase: null,
  platform: createYouTubePlatform({
    getYt: () => (window as unknown as YtWindow).ytgame,
    fallbackPauseChange: noopPlatform.onPauseChange,
  }),
  ads: noAds,
  payments: null,
};
