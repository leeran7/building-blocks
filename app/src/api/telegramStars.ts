/**
 * Gem pack prices in Telegram Stars (currency "XTR"). Client-safe, no server
 * imports: the Telegram build shows these prices, and the server invoices and
 * settles from this table only, never from a price or gem count in a request.
 *
 * Derivation: Telegram pays developers about $0.013 per Star, so a pack's web
 * price `usdCents` is worth usdCents / 1.3 Stars to us. That is rounded to the
 * nearest 25 Stars below 1,000 and the nearest 50 at or above, so the Shop
 * shows friendly numbers:
 *
 *   gems-500   $4.99  ->  384 ->  375 Stars
 *   gems-1200  $9.99  ->  768 ->  775 Stars
 *   gems-2600  $19.99 -> 1538 -> 1550 Stars
 *   gems-7000  $49.99 -> 3845 -> 3850 Stars
 *
 * Players buy Stars at more than $0.013 each (Telegram and the app stores take
 * their cut), the same way the App Store price carries Apple's 30%.
 */

import { GEM_PACKS, type GemPack } from "../lib/gemPacks";

/** Telegram Stars' ISO-style currency code. */
export const STARS_CURRENCY = "XTR";

/** US cents Telegram pays the developer per Star, times 10 (1.3 cents = $0.013). */
const DEV_CENTS_PER_STAR_X10 = 13;

/** Below this many Stars prices round to SMALL_STEP, at or above it to LARGE_STEP. */
const STEP_THRESHOLD = 1000;
const SMALL_STEP = 25;
const LARGE_STEP = 50;

/** The friendly Stars price for a web price in US cents. */
export function starsForUsdCents(usdCents: number): number {
  const raw = (usdCents * 10) / DEV_CENTS_PER_STAR_X10;
  const step = raw < STEP_THRESHOLD ? SMALL_STEP : LARGE_STEP;
  return Math.max(step, Math.round(raw / step) * step);
}

/** Stars price per pack id, built once from the pack table. */
const STARS_BY_PACK: ReadonlyMap<string, number> = new Map(GEM_PACKS.map((p) => [p.id, starsForUsdCents(p.usdCents)]));

/** The Stars price for `pack`, or null when it is not one of ours. */
export function starsPrice(pack: GemPack): number | null {
  return STARS_BY_PACK.get(pack.id) ?? null;
}

/** "775 Stars" for display. */
export function formatStars(stars: number): string {
  return `${stars.toLocaleString("en-US")} Stars`;
}
