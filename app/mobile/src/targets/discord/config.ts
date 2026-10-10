import { PriceUtils } from "@discord/embedded-app-sdk";
import { apiFetch } from "../../lib/api";
import { noAds } from "../noop";
import type { TargetConfig } from "../types";
import { clientGemSkus } from "./env";
import { createDiscordPayments } from "./payments";
import { createDiscordPlatform } from "./platform";
import { discordSdk } from "./sdk";

/*
  The Discord Activity: every feature, signed in with the player's Discord
  account. API calls go through Discord's proxy ("/.proxy/api/..." -> the
  "/api" URL mapping); third-party hosts are patched in urlMappings.ts. This
  file must not import screens or the root. The SDK instance is created on
  first use, not on import (sdk.ts).
*/

/** The SDK once its handshake is done, or null outside Discord. */
async function readySdk() {
  const sdk = discordSdk();
  if (!sdk) return null;
  await sdk.ready();
  return sdk;
}

async function loadPurchaseSdk() {
  const sdk = await readySdk();
  return sdk ? { commands: sdk.commands, formatPrice: PriceUtils.formatPrice } : null;
}

async function loadLayout() {
  const sdk = await readySdk();
  if (!sdk) return null;
  return {
    async onLayoutMode(cb: (layoutMode: number) => void) {
      const listener = (e: { layout_mode: number }) => cb(e.layout_mode);
      await sdk.subscribe("ACTIVITY_LAYOUT_MODE_UPDATE", listener);
      return () => void sdk.unsubscribe("ACTIVITY_LAYOUT_MODE_UPDATE", listener).catch(() => undefined);
    },
  };
}

export const discordPayments = createDiscordPayments({
  load: loadPurchaseSdk,
  skus: clientGemSkus(),
  settle: () => apiFetch("/api/gems/discord", { method: "POST" }),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

export const targetConfig: TargetConfig = {
  id: "discord",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: true, leaderboard: true, daily: true, levels: true },
  apiBase: "/.proxy",
  platform: createDiscordPlatform(loadLayout),
  ads: noAds,
  payments: discordPayments,
};
