/**
 * Paid 1v1 Battles — server config. Central place for the stake allow-list,
 * top-up bounds, cash-out minimum, and the kill switch. All amounts in cents
 * (1 credit = 1¢).
 */

/** Master kill switch. Paid-duel endpoints 404/403 unless this is on. */
export const PAID_DUELS_ENABLED = process.env.PAID_DUELS_ENABLED === "true";

/**
 * Client-visible mirror of the kill switch for conditionally rendering paid UI.
 * Must be kept in sync with PAID_DUELS_ENABLED in the environment. Safe to
 * import in client components (only reads a NEXT_PUBLIC_ var).
 */
export const PAID_DUELS_ENABLED_PUBLIC =
  process.env.NEXT_PUBLIC_PAID_DUELS_ENABLED === "true";

/** Allowed per-player stakes, in cents. Server rejects anything else. */
export const STAKE_TIERS_CENTS = [100, 200, 500, 1000] as const;
export type StakeTierCents = (typeof STAKE_TIERS_CENTS)[number];

export function isValidStakeCents(cents: number): cents is StakeTierCents {
  return (STAKE_TIERS_CENTS as readonly number[]).includes(cents);
}

/** Platform rake as a fraction of the pot. Winner receives (1 - rake) × 2 × stake. */
export const DUEL_RAKE = 0.1;

/** Winner payout in cents for a given per-player stake (pot = 2×stake, 10% rake). */
export function duelPayoutCents(stakeCents: number): number {
  return Math.floor(stakeCents * 2 * (1 - DUEL_RAKE));
}

/** Minimum cashable withdrawal (winnings bucket). */
export const CASHOUT_MIN_CENTS = Number(process.env.CASHOUT_MIN_CENTS ?? 1000);

/** Credit top-up bounds (fee-efficient floor, sane ceiling). */
export const CREDITS_MIN_TOPUP_CENTS = Number(process.env.CREDITS_MIN_TOPUP_CENTS ?? 500);
export const CREDITS_MAX_TOPUP_CENTS = Number(process.env.CREDITS_MAX_TOPUP_CENTS ?? 50000);
