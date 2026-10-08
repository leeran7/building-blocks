import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

/** itch.io: endless Free Climb only. No host SDK and no ads; saves in localStorage. */
export const targetConfig: TargetConfig = {
  id: "itch",
  name: "Doomstack",
  features: { signIn: false, shop: false, duels: false, leaderboard: false, daily: false, levels: false },
  apiBase: null,
  platform: noopPlatform,
  ads: noAds,
  payments: null,
};
