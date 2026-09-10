/**
 * Repeat-pairing outcome-skew detection (chip-dumping heuristic).
 *
 * Pure grouping/scoring logic, kept separate from the Prisma query in
 * db/duel.ts (getSuspiciousPairingForUser) so it's testable without a
 * database. See config/paidDuel.ts for the threshold constants and the
 * reasoning for why this checks outcome pattern rather than IP proximity.
 */

import { PAIRING_SKEW_MIN_MATCHES, PAIRING_SKEW_WIN_RATE } from "../config/paidDuel";

export interface SettledPaidDuel {
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
}

/**
 * True when `userId` has an opponent they've faced at least
 * PAIRING_SKEW_MIN_MATCHES times with a win rate at or above
 * PAIRING_SKEW_WIN_RATE against that specific opponent.
 */
export function hasSkewedPairing(duels: SettledPaidDuel[], userId: string): boolean {
  const byOpponent = new Map<string, { total: number; wins: number }>();

  for (const d of duels) {
    const opponent = d.player1Id === userId ? d.player2Id : d.player1Id;
    if (!opponent || opponent === userId) continue;
    const rec = byOpponent.get(opponent) ?? { total: 0, wins: 0 };
    rec.total += 1;
    if (d.winnerId === userId) rec.wins += 1;
    byOpponent.set(opponent, rec);
  }

  for (const rec of byOpponent.values()) {
    if (rec.total >= PAIRING_SKEW_MIN_MATCHES && rec.wins / rec.total >= PAIRING_SKEW_WIN_RATE) {
      return true;
    }
  }
  return false;
}
