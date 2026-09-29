/**
 * Gem packs: the one thing in the Shop bought with real money. Gems then buy
 * characters, skins (src/lib/avatars.ts) and lives. Client-safe (the mobile
 * Shop imports it); the server settles a purchase from this table only, never
 * from a gem count or price the request or a payment's metadata claims.
 *
 * Each pack is sold two ways:
 *  - web: Stripe Checkout at `usdCents` (POST /api/gems/checkout);
 *  - iOS: an App Store consumable with id `appleProductId`, created in App
 *    Store Connect at the matching price tier (POST /api/gems/apple).
 */

export interface GemPack {
  readonly id: string;
  readonly gems: number;
  /** Web price in US cents, charged by Stripe Checkout. */
  readonly usdCents: number;
  /** App Store consumable product id (App Store Connect). */
  readonly appleProductId: string;
  /** Short badge for the pack card, if any. */
  readonly badge?: string;
}

const APPLE_PREFIX = "lol.doomstack.app.gems";

const pack = (gems: number, usdCents: number, badge?: string): GemPack => ({
  id: `gems-${gems}`,
  gems,
  usdCents,
  appleProductId: `${APPLE_PREFIX}${gems}`,
  ...(badge ? { badge } : {}),
});

/** Cheapest first. 1,200 gems (one skin) is the $9.99 pack. */
export const GEM_PACKS: readonly GemPack[] = [
  pack(500, 499),
  pack(1200, 999, "Buys a skin"),
  pack(2600, 1999, "Most popular"),
  pack(7000, 4999, "Best value"),
];

/** The pack with id `v`, or null for anything else. */
export function gemPackById(v: unknown): GemPack | null {
  return typeof v === "string" ? (GEM_PACKS.find((p) => p.id === v) ?? null) : null;
}

/** The pack sold as App Store product `v`, or null for anything else. */
export function gemPackByAppleProduct(v: unknown): GemPack | null {
  return typeof v === "string" ? (GEM_PACKS.find((p) => p.appleProductId === v) ?? null) : null;
}

/** "$9.99" for a web price. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
