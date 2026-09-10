/**
 * Prepaid credits wallet.
 *
 * play_credits_cents — purchased via Stripe, used for chip-duel stakes and
 * tournament entry fees. Non-cashable.
 *
 * Every balance mutation is written with an explicit new value while holding a
 * `SELECT ... FOR UPDATE` lock on the user row, and each bucket touched emits
 * one append-only WalletLedger row carrying balance_after — so the wallet is
 * fully auditable and concurrent mutations can never overspend.
 */

import { prisma } from "./client";
import { WalletBucket, WalletLedgerKind } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  id: string;
  bucket: WalletBucket;
  amountCents: number;
  balanceAfter: number;
  kind: WalletLedgerKind;
  duelId: string | null;
  note: string | null;
  createdAt: string;
}

export interface WalletView {
  playCents: number;
  ledger: LedgerRow[];
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getWallet(userId: string, ledgerLimit = 25): Promise<WalletView> {
  const [user, ledger] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { play_credits_cents: true },
    }),
    prisma.walletLedger.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: ledgerLimit,
    }),
  ]);

  return {
    playCents: user?.play_credits_cents ?? 0,
    ledger: ledger.map((r) => ({
      id: r.id,
      bucket: r.bucket,
      amountCents: r.amount_cents,
      balanceAfter: r.balance_after,
      kind: r.kind,
      duelId: r.duel_id,
      note: r.note,
      createdAt: r.created_at.toISOString(),
    })),
  };
}

// ── Purchase settlement (Stripe top-up) ────────────────────────────────────────

export type AddPurchaseResult =
  | { outcome: "credited"; playAfter: number }
  | { outcome: "duplicate" };

export async function addPurchasedCredits(
  userId: string,
  stripeSessionId: string,
  amountCents: number
): Promise<AddPurchaseResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

    const existing = await tx.creditPurchase.findUnique({
      where: { stripe_session_id: stripeSessionId },
    });
    if (existing) return { outcome: "duplicate" } satisfies AddPurchaseResult;

    await tx.creditPurchase.create({
      data: { user_id: userId, stripe_session_id: stripeSessionId, amount_cents: amountCents },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { play_credits_cents: { increment: amountCents } },
      select: { play_credits_cents: true },
    });

    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.PLAY,
        amount_cents: amountCents,
        balance_after: updated.play_credits_cents,
        kind: WalletLedgerKind.PURCHASE,
      },
    });

    return { outcome: "credited", playAfter: updated.play_credits_cents } satisfies AddPurchaseResult;
  });
}
