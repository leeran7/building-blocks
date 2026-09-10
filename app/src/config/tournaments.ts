export { PAID_DUELS_ENABLED as TOURNAMENTS_ENABLED, PAID_DUELS_ENABLED_PUBLIC as TOURNAMENTS_ENABLED_PUBLIC } from "./paidDuel";

export const TOURNAMENT_BRACKET_SIZES = [4, 8, 16, 32] as const;
export type BracketSize = (typeof TOURNAMENT_BRACKET_SIZES)[number];

export function isValidBracketSize(n: number): n is BracketSize {
  return (TOURNAMENT_BRACKET_SIZES as readonly number[]).includes(n);
}

export function totalRounds(bracketSize: number): number {
  return Math.log2(bracketSize);
}
