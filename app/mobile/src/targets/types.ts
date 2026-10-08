/**
 * Build targets: one codebase, one bundle per place the game ships.
 *
 * `pnpm mobile:build --mode <target>` aliases `@target` to `targets/<target>/`
 * (vite.config.mts), so a bundle holds exactly one target's config, root and
 * adapters. The portal roots (crazygames, youtube, itch) never import the
 * app's screens, so online features never ship there: portals must make no
 * network calls but their SDK's. The Telegram and Discord roots reuse the app
 * shell, so a feature turned off there (duels) is hidden by `features` at
 * runtime: its routes and entry points are gated, but its code is in the bundle.
 *
 * Each target folder has two entry files:
 *  - `config.ts`: plain data and adapters (TargetConfig). Shared libs such as
 *    lib/api.ts read it, so it must never import a screen or the root.
 *  - `root.tsx`: the React tree main.tsx renders (TargetRoot).
 */

import type { ComponentType } from "react";
import type { GemPack } from "@app/lib/gemPacks";
import type { PackPurchaseResult } from "../lib/shop";

export type TargetId = "app" | "crazygames" | "youtube" | "itch" | "telegram" | "discord";

export const TARGET_IDS: readonly TargetId[] = ["app", "crazygames", "youtube", "itch", "telegram", "discord"];

/** What a target ships. Its root imports only the screens these allow. */
export interface TargetFeatures {
  /** A signed-in account (Firebase, or a platform login exchanged for one). */
  signIn: boolean;
  /** The gem shop and paid characters. */
  shop: boolean;
  /** 1v1 races over realtime. */
  duels: boolean;
  /** The online leaderboard and saved climb results. */
  leaderboard: boolean;
  /** The Daily Climb (server-seeded). */
  daily: boolean;
  /** The level map and level runs. */
  levels: boolean;
}

/**
 * The host platform's game lifecycle (CrazyGames SDK, YouTube Playables SDK,
 * Telegram WebApp, Discord Embedded App SDK). Every method must be safe to
 * call when the SDK failed to load or is blocked: it resolves or returns, and
 * never throws into the game.
 */
export interface PlatformAdapter {
  /** Load the SDK and initialise it. Resolves even when the SDK is missing. */
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  /** A run began (or resumed after a break). */
  gameplayStart(): void;
  /** A run ended or paused: death screen, pause, menu. */
  gameplayStop(): void;
  /** A moment worth celebrating, such as a new best height. Use sparingly. */
  happyMoment(): void;
  /** Platform-backed save, falling back to localStorage. Null when nothing is saved. */
  loadData(key: string): Promise<string | null>;
  saveData(key: string, value: string): Promise<void>;
  /** False while the platform says audio must stay off. */
  isAudioAllowed(): boolean;
  /** Subscribe to audio-allowed changes. Returns the unsubscribe. */
  onAudioAllowedChange(cb: (allowed: boolean) => void): () => void;
  /** Subscribe to platform pause/resume (tab hidden, host overlay). Returns the unsubscribe. */
  onPauseChange(cb: (paused: boolean) => void): () => void;
}

/** How an ad request ended. A reward is granted only on "finished". */
export type AdOutcome = "finished" | "skipped" | "error" | "unavailable";

export interface AdCallbacks {
  /** The ad actually began: pause the game and mute audio now. */
  onStart?(): void;
}

/**
 * Host-served ads. The caller pauses the game and blocks input from the
 * request until the promise settles, whatever the outcome.
 */
export interface AdsAdapter {
  /** Interstitial at a natural break (death or restart screen only). */
  midgame(cb?: AdCallbacks): Promise<AdOutcome>;
  /** Opt-in rewarded ad. Grant the reward only when this resolves "finished". */
  rewarded(cb?: AdCallbacks): Promise<AdOutcome>;
  /** False when this target never serves ads, so no ad UI is shown. */
  readonly enabled: boolean;
}

/**
 * How a target sells gem packs when the host platform has its own payments
 * (Telegram Stars, Discord SKUs). The server credits gems only after it has
 * verified the payment with the platform itself; the client never reports a
 * gem count. Load SDKs lazily inside these methods: config.ts must stay free
 * of screen imports, and lib/shop.ts imports this config.
 */
export interface PaymentsAdapter {
  /** Buy one pack. Throws ShopError (lib/shop.ts) on failure. */
  buyGemPack(pack: GemPack): Promise<PackPurchaseResult>;
  /** The price to show for a pack in this platform's currency ("250 Stars"). */
  packPrice(pack: GemPack): string;
  /** One line under the buy button saying where the payment happens. */
  checkoutNote: string;
}

export interface TargetConfig {
  id: TargetId;
  /** Display name in the host (store listing, portal page). */
  name: string;
  features: TargetFeatures;
  /**
   * Where `/api/...` calls go. An absolute origin (the native app), "" for
   * same-origin (a build served from doomstack.lol), a proxy prefix such as
   * "/.proxy" (Discord), or null when the target makes no API calls at all.
   */
  apiBase: string | null;
  platform: PlatformAdapter;
  ads: AdsAdapter;
  /** Platform payments for gem packs, or null for the app's own (StoreKit / Stripe). */
  payments: PaymentsAdapter | null;
}

/** The React tree a target renders inside main.tsx. */
export type TargetRoot = ComponentType;
