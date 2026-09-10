/**
 * Paid 1v1 Battles — prepaid credits wallet.
 *
 * Two buckets per user (both denominated in cents; 1 credit = 1¢):
 *   • play_credits_cents     — purchased via Stripe, NON-cashable.
 *   • winnings_credits_cents — won from duels, cashable.
 *
 * Every balance mutation is written with an explicit new value while holding a
 * `SELECT ... FOR UPDATE` lock on the user row, and each bucket touched emits
 * one append-only WalletLedger row carrying balance_after — so the wallet is
 * fully auditable and concurrent stakes/payouts can never overspend.
 *
 * Lock ordering (to avoid deadlocks): callers that also lock a duel row always
 * lock the DUEL first, then the USER (duel → user). The helpers here only ever
 * lock the user row.
 */

import { prisma } from "./client";
import { Prisma, WalletBucket, WalletLedgerKind } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

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
  winningsCents: number;
  ledger: LedgerRow[];
}

/** The play/winnings split actually taken from a user to fund a stake. */
export interface StakeSplit {
  playDebited: number;
  winningsDebited: number;
}

/**
 * Thrown by stakeInTx when the user cannot cover a stake. Throwing (rather than
 * returning) rolls back the enclosing transaction so a duel row is never left
 * created-but-unstaked. The route catches it and returns 402.
 */
export class InsufficientCreditsError extends Error {
  constructor(public readonly shortfallCents: number) {
    super("INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getWallet(userId: string, ledgerLimit = 25): Promise<WalletView> {
  const [user, ledger] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { play_credits_cents: true, winnings_credits_cents: true },
    }),
    prisma.walletLedger.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: ledgerLimit,
    }),
  ]);

  return {
    playCents: user?.play_credits_cents ?? 0,
    winningsCents: user?.winnings_credits_cents ?? 0,
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

/**
 * Credit a settled Stripe top-up to the PLAY bucket. Idempotent: the unique
 * CreditPurchase.stripe_session_id row is the guard, so a replayed webhook
 * no-ops. Runs in its own transaction (webhook context).
 */
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

// ── Staking (debit into a duel escrow) ─────────────────────────────────────────

/**
 * Pure split of a stake across the two buckets: PLAY credits are spent first,
 * then WINNINGS (so won, cashable money stays withdrawable as long as possible).
 * Returns the shortfall when the combined balance can't cover the stake.
 */
export function splitStake(
  playAvail: number,
  winningsAvail: number,
  stakeCents: number
):
  | { ok: true; playDebited: number; winningsDebited: number }
  | { ok: false; shortfallCents: number } {
  const total = playAvail + winningsAvail;
  if (total < stakeCents) return { ok: false, shortfallCents: stakeCents - total };
  const playDebited = Math.min(playAvail, stakeCents);
  return { ok: true, playDebited, winningsDebited: stakeCents - playDebited };
}

/**
 * Debit a stake from the user, PLAY credits first then WINNINGS (keeps won money
 * withdrawable for as long as possible). Must run inside the same transaction
 * that creates/updates the duel row, so the debit and the escrow row commit
 * together. Locks the user row FOR UPDATE so concurrent stakes cannot overspend.
 *
 * Returns the bucket split so the caller can record it on the duel for refunds.
 * Throws InsufficientCreditsError (rolling back the tx) when the balance is short.
 */
export async function stakeInTx(
  tx: TxClient,
  userId: string,
  stakeCents: number,
  duelId: string
): Promise<StakeSplit> {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { play_credits_cents: true, winnings_credits_cents: true },
  });

  const split = splitStake(u.play_credits_cents, u.winnings_credits_cents, stakeCents);
  if (!split.ok) {
    throw new InsufficientCreditsError(split.shortfallCents);
  }

  const { playDebited, winningsDebited } = split;
  const newPlay = u.play_credits_cents - playDebited;
  const newWinnings = u.winnings_credits_cents - winningsDebited;

  await tx.user.update({
    where: { id: userId },
    data: { play_credits_cents: newPlay, winnings_credits_cents: newWinnings },
  });

  if (playDebited > 0) {
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.PLAY,
        amount_cents: -playDebited,
        balance_after: newPlay,
        kind: WalletLedgerKind.STAKE,
        duel_id: duelId,
      },
    });
  }
  if (winningsDebited > 0) {
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.WINNINGS,
        amount_cents: -winningsDebited,
        balance_after: newWinnings,
        kind: WalletLedgerKind.STAKE,
        duel_id: duelId,
      },
    });
  }

  return { playDebited, winningsDebited };
}

// ── Payout (credit the winner) ─────────────────────────────────────────────────

/**
 * Credit a duel payout to the winner's WINNINGS bucket (cashable). Called from
 * settlePayoutInTx inside the duel-resolution transaction (duel row already
 * locked); locks the winner's user row second (duel → user order).
 */
export async function creditWinningsInTx(
  tx: TxClient,
  userId: string,
  amountCents: number,
  duelId: string
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { winnings_credits_cents: true },
  });
  const newWinnings = u.winnings_credits_cents + amountCents;

  await tx.user.update({
    where: { id: userId },
    data: { winnings_credits_cents: newWinnings },
  });
  await tx.walletLedger.create({
    data: {
      user_id: userId,
      bucket: WalletBucket.WINNINGS,
      amount_cents: amountCents,
      balance_after: newWinnings,
      kind: WalletLedgerKind.WIN,
      duel_id: duelId,
    },
  });
}

// ── Refund (return a stake to its source buckets) ──────────────────────────────

/**
 * Return a stake to the exact buckets it was taken from — purchased play credits
 * go back to PLAY, winnings go back to WINNINGS — so a refund can never launder
 * non-cashable credits into cashable winnings. Called from claimRefundInTx.
 */
export async function creditRefundInTx(
  tx: TxClient,
  userId: string,
  playCents: number,
  winningsCents: number,
  duelId: string
): Promise<void> {
  if (playCents === 0 && winningsCents === 0) return;

  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { play_credits_cents: true, winnings_credits_cents: true },
  });
  const newPlay = u.play_credits_cents + playCents;
  const newWinnings = u.winnings_credits_cents + winningsCents;

  await tx.user.update({
    where: { id: userId },
    data: { play_credits_cents: newPlay, winnings_credits_cents: newWinnings },
  });

  if (playCents > 0) {
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.PLAY,
        amount_cents: playCents,
        balance_after: newPlay,
        kind: WalletLedgerKind.REFUND,
        duel_id: duelId,
      },
    });
  }
  if (winningsCents > 0) {
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.WINNINGS,
        amount_cents: winningsCents,
        balance_after: newWinnings,
        kind: WalletLedgerKind.REFUND,
        duel_id: duelId,
      },
    });
  }
}

// ── Cash-out (winnings only) ───────────────────────────────────────────────────

export type CashoutResult =
  | { outcome: "requested"; winningsAfter: number }
  | { outcome: "insufficient" }
  | { outcome: "below_min" };

/**
 * Request a withdrawal. Draws EXCLUSIVELY from the cashable WINNINGS bucket —
 * purchased play credits are never withdrawable. Debits immediately and records
 * a CASHOUT_REQUEST ledger row; an admin fulfils the payout off-platform at MVP.
 */
export async function requestCashout(
  userId: string,
  amountCents: number,
  minCents: number
): Promise<CashoutResult> {
  if (amountCents < minCents) return { outcome: "below_min" };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const u = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { winnings_credits_cents: true },
    });
    if (u.winnings_credits_cents < amountCents) {
      return { outcome: "insufficient" } satisfies CashoutResult;
    }

    const newWinnings = u.winnings_credits_cents - amountCents;
    await tx.user.update({
      where: { id: userId },
      data: { winnings_credits_cents: newWinnings },
    });
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.WINNINGS,
        amount_cents: -amountCents,
        balance_after: newWinnings,
        kind: WalletLedgerKind.CASHOUT_REQUEST,
      },
    });

    return { outcome: "requested", winningsAfter: newWinnings } satisfies CashoutResult;
  });
}
