import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

/**
 * The app on the website (doomstack.lol/play and /daily): every feature, no
 * host SDK. Same screens as the native app; what differs in a browser (API
 * origin, guest-first start, Stripe in the same tab, no Apple button) keys off
 * WEB_BUILD in lib/buildTarget.ts.
 */
export const targetConfig: TargetConfig = {
  id: "web",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true },
  platform: noopPlatform,
  ads: noAds,
};
