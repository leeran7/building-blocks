export { PAID_DUELS_ENABLED as TOURNAMENTS_ENABLED, PAID_DUELS_ENABLED_PUBLIC as TOURNAMENTS_ENABLED_PUBLIC } from "./paidDuel";

export const TOURNAMENT_BRACKET_SIZES = [4, 8, 16, 32] as const;
export type BracketSize = (typeof TOURNAMENT_BRACKET_SIZES)[number];

export function isValidBracketSize(n: number): n is BracketSize {
  return (TOURNAMENT_BRACKET_SIZES as readonly number[]).includes(n);
}

export function totalRounds(bracketSize: number): number {
  return Math.log2(bracketSize);
}

/**
 * Tournaments are announced but not open yet. While this is true every
 * tournament API route answers 503 COMING_SOON, and the /tournaments pages say
 * "coming soon" instead of asking visitors to sign in and enter. Flip it to
 * open them; TOURNAMENTS_ENABLED (the paid-modes flag) still applies after.
 */
export const TOURNAMENTS_COMING_SOON: boolean = true;
