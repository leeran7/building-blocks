/**
 * Gem packs in the Discord Activity: each pack is a Discord consumable SKU.
 *
 * Buying: `startPurchase({ sku_id })` opens Discord's checkout. Whatever it
 * returns, the client then asks the server to settle (POST /api/gems/discord):
 * the server reads the player's entitlements from Discord itself, credits each
 * new gem pack once and consumes it. The client never reports what was bought.
 * When Discord says the purchase completed but the entitlement is not listed
 * yet, settling is retried a few times; anything still missing settles on the
 * next launch (root.tsx settles once after sign-in).
 *
 * Prices: Discord's own price for the SKU (getSkus) once loaded, else the
 * pack's web USD price.
 */

import { formatUsd, type GemPack } from "@app/lib/gemPacks";
import { skuForPack, type GemSkuTable } from "@app/api/discordSkus";
import type { DiscordSDK } from "@discord/embedded-app-sdk";
import { ShopError, type PackPurchaseResult } from "../../lib/shop";
import type { PaymentsAdapter } from "../types";

/** Settle attempts after Discord reports a completed purchase. */
export const SETTLE_ATTEMPTS = 4;
/** Pause between settle attempts while Discord lists the new entitlement. */
export const SETTLE_RETRY_MS = 1_500;

/** The SDK pieces payments use, loaded lazily (a fake in tests). */
export interface PurchaseSdk {
  commands: Pick<DiscordSDK["commands"], "startPurchase" | "getSkus">;
  formatPrice(price: { amount: number; currency: string }): string;
}

export interface DiscordPaymentsDeps {
  /** The SDK, or null outside Discord. */
  load(): Promise<PurchaseSdk | null>;
  /** This build's SKU table (env.ts). */
  skus: GemSkuTable;
  /** POST /api/gems/discord with the player's token. */
  settle(): Promise<Response>;
  wait(ms: number): Promise<void>;
}

export interface DiscordPayments extends PaymentsAdapter {
  /** Fetch Discord's prices for the table's SKUs. Best-effort; never throws. */
  loadPrices(): Promise<void>;
  /** Settle any unsettled purchases. The new balance when anything was credited, else null. Never throws. */
  settlePending(): Promise<number | null>;
}

interface Settled {
  gems: number;
  /** Entitlements credited now or by an earlier call. */
  settled: number;
}

function parseSettled(v: unknown): Settled | null {
  if (typeof v !== "object" || v === null) return null;
  const { gems, credited, duplicates } = v as { gems?: unknown; credited?: unknown; duplicates?: unknown };
  if (typeof gems !== "number" || typeof credited !== "number" || typeof duplicates !== "number") return null;
  return { gems, settled: credited + duplicates };
}

function looksCancelled(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null ? String((err as { message?: unknown }).message) : String(err);
  return /cancel|closed|dismiss/i.test(msg);
}

export function createDiscordPayments(deps: DiscordPaymentsDeps): DiscordPayments {
  /** SKU id -> Discord's formatted price. */
  const prices = new Map<string, string>();

  async function settleOnce(): Promise<Settled | null> {
    try {
      const res = await deps.settle();
      if (!res.ok) return null;
      return parseSettled(await res.json().catch(() => null));
    } catch {
      return null;
    }
  }

  return {
    checkoutNote: "Paid through Discord",
    packPrice(pack: GemPack): string {
      const sku = skuForPack(deps.skus, pack.id);
      return (sku !== null ? prices.get(sku) : undefined) ?? formatUsd(pack.usdCents);
    },

    async loadPrices(): Promise<void> {
      try {
        const sdk = await deps.load();
        if (!sdk) return;
        const { skus } = await sdk.commands.getSkus();
        for (const sku of skus) {
          if (Object.prototype.hasOwnProperty.call(deps.skus, sku.id)) prices.set(sku.id, sdk.formatPrice(sku.price));
        }
      } catch {
        // Keep the web prices.
      }
    },

    async settlePending(): Promise<number | null> {
      const s = await settleOnce();
      return s && s.settled > 0 ? s.gems : null;
    },

    async buyGemPack(pack: GemPack): Promise<PackPurchaseResult> {
      const skuId = skuForPack(deps.skus, pack.id);
      if (!skuId) throw new ShopError("This gem pack isn't on sale in Discord yet.", "UNAVAILABLE");
      const sdk = await deps.load();
      if (!sdk) throw new ShopError("Open Doomstack in Discord to buy gems.", "UNAVAILABLE");

      let purchased = false;
      let purchaseError: unknown = null;
      try {
        const entitlements = await sdk.commands.startPurchase({ sku_id: skuId });
        purchased = Array.isArray(entitlements) && entitlements.length > 0;
      } catch (err) {
        purchaseError = err;
      }

      // Settle even when Discord reported nothing: a purchase may have gone
      // through before the modal closed. Retry only when it says it did.
      const attempts = purchased ? SETTLE_ATTEMPTS : 1;
      for (let i = 0; i < attempts; i++) {
        if (i > 0) await deps.wait(SETTLE_RETRY_MS);
        const s = await settleOnce();
        if (s && s.settled > 0) return { kind: "credited", gems: s.gems };
      }

      if (purchased) {
        throw new ShopError("Your purchase went through but the gems didn't arrive yet. Reopen Doomstack to retry.", "PENDING");
      }
      if (purchaseError !== null && !looksCancelled(purchaseError)) {
        throw new ShopError("Discord couldn't complete the purchase. Try again.", null);
      }
      return { kind: "cancelled" };
    },
  };
}
