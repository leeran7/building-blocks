import { Capacitor } from "@capacitor/core";
import { noopPlatform } from "../noop";
import type { TargetConfig } from "../types";
import { createAdMobAds } from "./admob";
import { ADMOB_IOS_TEST_UNITS, ADMOB_IOS_UNITS } from "./adUnits";

// Dev builds always use Google's test units; production uses the live ones,
// and serves no ads while they are empty.
const testing = import.meta.env.DEV;

/** The native iOS app (Capacitor): every feature, no host SDK, AdMob ads. */
export const targetConfig: TargetConfig = {
  id: "app",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true },
  platform: noopPlatform,
  ads: createAdMobAds({
    platform: Capacitor.getPlatform(),
    units: testing ? ADMOB_IOS_TEST_UNITS : ADMOB_IOS_UNITS,
    testing,
    load: async () => (await import("@capacitor-community/admob")).AdMob,
  }),
};
