import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

/** The native iOS / Android app (Capacitor): every feature, no host SDK. */
export const targetConfig: TargetConfig = {
  id: "app",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true },
  apiBase: "https://www.doomstack.lol",
  platform: noopPlatform,
  ads: noAds,
};
