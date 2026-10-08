import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

// Placeholder: the itch workstream replaces the adapters (see plans/multi-platform-build.md).
export const targetConfig: TargetConfig = {
  id: "itch",
  name: "Doomstack",
  features: { signIn: false, shop: false, duels: false, leaderboard: false, daily: false, levels: false },
  apiBase: null,
  platform: noopPlatform,
  ads: noAds,
  payments: null,
};
