import { formatStars, starsPrice } from "@app/api/telegramStars";
import { formatUsd } from "@app/lib/gemPacks";
import { noAds } from "../noop";
import type { TargetConfig } from "../types";
import { telegramPlatform } from "./platform";

/**
 * The Telegram Mini App, served from doomstack.lol/play/telegram (hosting.cjs).
 * Signs in with Telegram's signed initData (root.tsx), sells gem packs for
 * Telegram Stars, and has no duels (no Versus, Challenge or duel routes) and
 * no ads. The payments code loads on the first purchase.
 */
export const targetConfig: TargetConfig = {
  id: "telegram",
  name: "Doomstack",
  features: { signIn: true, shop: true, duels: false, leaderboard: true, daily: true, levels: true },
  apiBase: "",
  platform: telegramPlatform,
  ads: noAds,
  payments: {
    buyGemPack: async (pack) => (await import("./payments")).buyStarsPack(pack),
    packPrice: (pack) => {
      const stars = starsPrice(pack);
      return stars === null ? formatUsd(pack.usdCents) : formatStars(stars);
    },
    checkoutNote: "Paid with Telegram Stars",
  },
};
