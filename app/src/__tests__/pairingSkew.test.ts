/**
 * Repeat-pairing outcome-skew heuristic — pure logic, no database needed.
 * Thresholds (PAIRING_SKEW_MIN_MATCHES=5, PAIRING_SKEW_WIN_RATE=0.8) live in
 * config/paidDuel.ts; this exercises the grouping/scoring against them.
 */

import { describe, it, expect } from "vitest";
import { hasSkewedPairing, type SettledPaidDuel } from "../lib/pairingSkew";

function duel(player1Id: string, player2Id: string, winnerId: string): SettledPaidDuel {
  return { player1Id, player2Id, winnerId };
}

describe("hasSkewedPairing", () => {
  it("flags a user who wins almost every match against one repeat opponent", () => {
    const duels: SettledPaidDuel[] = [
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      duel("b", "a", "a"),
      duel("a", "b", "a"),
      duel("b", "a", "b"), // one loss — still 4/5 = 80%
    ];
    expect(hasSkewedPairing(duels, "a")).toBe(true);
  });

  it("does not flag roughly even results against a repeat opponent", () => {
    const duels: SettledPaidDuel[] = [
      duel("a", "b", "a"),
      duel("a", "b", "b"),
      duel("b", "a", "a"),
      duel("b", "a", "b"),
      duel("a", "b", "a"),
    ];
    expect(hasSkewedPairing(duels, "a")).toBe(false);
  });

  it("does not flag a skewed record with too few matches to be meaningful", () => {
    // 3/3 wins against one opponent, but below PAIRING_SKEW_MIN_MATCHES (5).
    const duels: SettledPaidDuel[] = [
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      duel("a", "b", "a"),
    ];
    expect(hasSkewedPairing(duels, "a")).toBe(false);
  });

  it("does not flag a skewed rate spread across many different opponents", () => {
    // 5 wins, but against 5 distinct opponents — no single repeat pairing.
    const duels: SettledPaidDuel[] = [
      duel("a", "b", "a"),
      duel("a", "c", "a"),
      duel("a", "d", "a"),
      duel("a", "e", "a"),
      duel("a", "f", "a"),
    ];
    expect(hasSkewedPairing(duels, "a")).toBe(false);
  });

  it("evaluates each opponent independently — a skew against one doesn't need help from another", () => {
    const duels: SettledPaidDuel[] = [
      // 5-0 against "b" — flagged on its own.
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      duel("a", "b", "a"),
      // Even record against "c" — irrelevant to the "b" skew.
      duel("a", "c", "a"),
      duel("a", "c", "c"),
    ];
    expect(hasSkewedPairing(duels, "a")).toBe(true);
  });

  it("ignores a duel with no second player (unjoined/voided rows shouldn't reach this, but stay safe)", () => {
    const duels: SettledPaidDuel[] = [{ player1Id: "a", player2Id: null, winnerId: "a" }];
    expect(hasSkewedPairing(duels, "a")).toBe(false);
  });
});
