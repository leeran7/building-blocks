/** Internal storage units per display chip (play_credits_cents per chip). */
export const CHIP_TO_CENTS_RATIO = 100;

export interface ChipPackage {
  usd: number;
  chips: number;
  bonusPct: number;
}

export const CHIP_PACKAGES: ChipPackage[] = [
  { usd: 5,  chips: 50_000,   bonusPct: 0 },
  { usd: 10, chips: 110_000,  bonusPct: 10 },
  { usd: 20, chips: 240_000,  bonusPct: 20 },
  { usd: 50, chips: 650_000,  bonusPct: 30 },
];

/** Return the chip amount (in play_credits_cents) for a given USD spend. */
export function chipsForUsd(usd: number): number {
  const pkg = CHIP_PACKAGES.find((p) => p.usd === usd);
  return pkg ? pkg.chips : usd * CHIP_TO_CENTS_RATIO * CHIP_TO_CENTS_RATIO;
}

/** Convert play_credits_cents to display chip count (1 chip = CHIP_TO_CENTS_RATIO play_credits_cents). */
export function chipCentsToCount(cents: number): number {
  return cents / CHIP_TO_CENTS_RATIO;
}

/** Format play_credits_cents as a localized display chip string. */
export function formatChipCents(cents: number): string {
  return (cents / CHIP_TO_CENTS_RATIO).toLocaleString();
}
