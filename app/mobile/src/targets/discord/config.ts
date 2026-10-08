import { noAds, noopPlatform } from "../noop";
import type { TargetConfig } from "../types";

// Placeholder: the discord workstream replaces the adapters (see plans/multi-platform-build.md).
export const targetConfig: TargetConfig = {
  id: "discord",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true },
  apiBase: "/.proxy",
  platform: noopPlatform,
  ads: noAds,
};
