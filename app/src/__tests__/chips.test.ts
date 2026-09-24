import { describe, it, expect } from "vitest";
import { WalletLedgerKind } from "@prisma/client";
import {
  isValidChipTier,
  CHIP_TIERS,
  refundChipDuelInTx,
  settleChipDuelInTx,
} from "../db/chips";

// Minimal fake TransactionClient that records walletLedger.create payloads, so
// we can assert the LEDGER KIND the production functions write (invoking the
// real unit — not re-implementing or grepping it).
function makeTx(balances: Record<string, number>) {
  const ledgerCreates: Array<{ user_id: string; amount_cents: number; kind: WalletLedgerKind }> = [];
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        play_credits_cents: balances[where.id] ?? 0,
      }),
      update: async ({ where, data }: { where: { id: string }; data: { play_credits_cents: number } }) => {
        balances[where.id] = data.play_credits_cents;
        return {};
      },
    },
    walletLedger: {
      create: async ({ data }: { data: (typeof ledgerCreates)[number] }) => {
        ledgerCreates.push(data);
        return data;
      },
    },
    duel: { update: async () => ({}) },
  };
  // The production signatures take a Prisma.TransactionClient; this fake only
  // implements the calls these two functions actually make.
  return { tx: tx as unknown as Parameters<typeof refundChipDuelInTx>[0], ledgerCreates };
}

describe("isValidChipTier", () => {
  it("accepts exactly the configured chip tiers", () => {
    for (const tier of CHIP_TIERS) {
      expect(isValidChipTier(tier)).toBe(true);
    }
  });

  it("rejects anything off the list", () => {
    expect(isValidChipTier(0)).toBe(false);
    expect(isValidChipTier(50)).toBe(false);
    expect(isValidChipTier(200)).toBe(false);
    expect(isValidChipTier(300)).toBe(false);
    expect(isValidChipTier(999)).toBe(false);
    expect(isValidChipTier(-100)).toBe(false);
  });
});

describe("CHIP_TIERS", () => {
  it("contains the expected set of non-cashable chip amounts", () => {
    expect(CHIP_TIERS).toEqual([100, 250, 500, 1000, 2500]);
  });
});

describe("wallet ledger kind labelling", () => {
  it("records a stake refund as REFUND, never WIN", async () => {
    const { tx, ledgerCreates } = makeTx({ p1: 0, p2: 0 });
    await refundChipDuelInTx(tx, "duel1", "p1", 100, "p2", 100);

    expect(ledgerCreates).toHaveLength(2);
    // The defect this guards: refunds were credited with kind=WIN, corrupting
    // the audit trail. Each returned stake must be labelled REFUND.
    for (const row of ledgerCreates) {
      expect(row.kind).toBe(WalletLedgerKind.REFUND);
    }
    expect(ledgerCreates.map((r) => r.user_id).sort()).toEqual(["p1", "p2"]);
  });

  it("records a settlement payout as WIN", async () => {
    const { tx, ledgerCreates } = makeTx({ winner: 0 });
    await settleChipDuelInTx(tx, "duel1", "winner", 100);

    expect(ledgerCreates).toHaveLength(1);
    expect(ledgerCreates[0].kind).toBe(WalletLedgerKind.WIN);
    expect(ledgerCreates[0].amount_cents).toBe(200); // full pot, zero-sum
  });
});
