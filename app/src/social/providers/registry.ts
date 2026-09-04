/**
 * Platform -> SocialProvider lookup. This is the ONLY place code should
 * branch on `Platform` to pick an implementation — services/agent tools call
 * `getProvider(platform)` and only ever see the generic `SocialProvider`
 * interface (AC-66).
 */

import type { SocialPlatform } from "../types";
import type { SocialProvider } from "./types";
import { tiktokProvider } from "./tiktokProvider";
import { xProvider } from "./xProvider";
import { youtubeProvider } from "./youtubeProvider";

const registry: Record<SocialPlatform, SocialProvider> = {
  TIKTOK: tiktokProvider,
  X: xProvider,
  YOUTUBE: youtubeProvider,
};

export function getProvider(platform: SocialPlatform): SocialProvider {
  const provider = registry[platform];
  if (!provider) {
    throw new Error(`No SocialProvider registered for platform "${platform}"`);
  }
  return provider;
}

export function getAllProviders(): SocialProvider[] {
  return Object.values(registry);
}
