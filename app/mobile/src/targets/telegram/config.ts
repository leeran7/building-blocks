import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

// Placeholder: the telegram workstream replaces the adapters (see plans/multi-platform-build.md).
export const targetConfig: TargetConfig = {
  id: "telegram",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: false, leaderboard: true, daily: true, levels: true },
  apiBase: "",
  platform: noopPlatform,
  ads: noAds,
  payments: null,
};
