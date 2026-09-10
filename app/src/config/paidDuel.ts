/**
 * Paid features — server config. Kill switch and credit top-up bounds.
 * All amounts in cents (1 credit = 1¢).
 */

/** Master kill switch. Paid-feature endpoints 404 unless this is on. */
export const PAID_DUELS_ENABLED = process.env.PAID_DUELS_ENABLED === "true";

/**
 * Client-visible mirror of the kill switch for conditionally rendering paid UI.
 */
export const PAID_DUELS_ENABLED_PUBLIC =
  process.env.NEXT_PUBLIC_PAID_DUELS_ENABLED === "true";

/** Credit top-up bounds (fee-efficient floor, sane ceiling). */
export const CREDITS_MIN_TOPUP_CENTS = Number(process.env.CREDITS_MIN_TOPUP_CENTS ?? 500);
export const CREDITS_MAX_TOPUP_CENTS = Number(process.env.CREDITS_MAX_TOPUP_CENTS ?? 50000);
