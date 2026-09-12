/**
 * Ranked chip duels — non-cashable, zero-sum.
 *
 * Chips are play_credits_cents. Winner receives exactly the loser's stake —
 * no house cut, no rake, no cashable winnings bucket. The debit/credit is a
 * plain increment/decrement on a single column, serialized with SELECT FOR
 * UPDATE so concurrent matches never overspend.
 */

import { prisma } from "./client";
import { DuelStatus, Prisma, WalletBucket, WalletLedgerKind } from "@prisma/client";
import { nanoid } from "nanoid";

type TxClient = Prisma.TransactionClient;

export class InsufficientChipsError extends Error {
  constructor(public readonly shortfallCents: number) {
    super("INSUFFICIENT_CHIPS");
    this.name = "InsufficientChipsError";
  }
}

export const CHIP_TIERS = [100, 250, 500, 1000, 2500] as const;
export type ChipTier = (typeof CHIP_TIERS)[number];

export function isValidChipTier(n: number): n is ChipTier {
  return (CHIP_TIERS as readonly number[]).includes(n);
}

// Ongoing free-play alternative to purchase — a one-time signup grant alone
// doesn't hold up (Kater v. Churchill Downs, 886 F.3d 784 (9th Cir. 2018)).
// 100 chips/day = enough to enter multiple low-tier duels without purchasing.
export const DAILY_CHIP_GRANT_CENTS = 10_000; // 100 chips
export const DAILY_GRANT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a user is eligible to claim the daily free chip grant right now — the
 * same rolling-24h rule claimDailyChips() enforces, exposed for read paths (the
 * wallet view) so the UI can hide the claim button once it's been claimed today.
 */
export function canClaimDailyChips(
  lastClaimAt: Date | null,
  now: Date = new Date()
): boolean {
  return (
    !lastClaimAt || now.getTime() - lastClaimAt.getTime() >= DAILY_GRANT_COOLDOWN_MS
  );
}

export class DailyGrantAlreadyClaimedError extends Error {
  constructor(public readonly nextClaimAt: Date) {
    super("DAILY_GRANT_ALREADY_CLAIMED");
    this.name = "DailyGrantAlreadyClaimedError";
  }
}

/**
 * Claim the daily free chip grant. One claim per rolling 24h window per user,
 * enforced by row lock so concurrent requests can't double-grant.
 */
export async function claimDailyChips(userId: string): Promise<{ balanceAfter: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const u = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { play_credits_cents: true, last_daily_chips_claim_at: true },
    });

    const now = new Date();
    if (
      u.last_daily_chips_claim_at &&
      now.getTime() - u.last_daily_chips_claim_at.getTime() < DAILY_GRANT_COOLDOWN_MS
    ) {
      throw new DailyGrantAlreadyClaimedError(
        new Date(u.last_daily_chips_claim_at.getTime() + DAILY_GRANT_COOLDOWN_MS)
      );
    }

    const after = u.play_credits_cents + DAILY_CHIP_GRANT_CENTS;
    await tx.user.update({
      where: { id: userId },
      data: { play_credits_cents: after, last_daily_chips_claim_at: now },
    });
    await tx.walletLedger.create({
      data: {
        user_id: userId,
        bucket: WalletBucket.PLAY,
        amount_cents: DAILY_CHIP_GRANT_CENTS,
        balance_after: after,
        kind: WalletLedgerKind.DAILY_GRANT,
      },
    });

    return { balanceAfter: after };
  });
}

// ── Staking ──────────────────────────────────────────────────────────────────

async function debitChipsInTx(
  tx: TxClient,
  userId: string,
  amount: number,
  duelId: string
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { play_credits_cents: true },
  });
  if (u.play_credits_cents < amount) {
    throw new InsufficientChipsError(amount - u.play_credits_cents);
  }
  const after = u.play_credits_cents - amount;
  await tx.user.update({
    where: { id: userId },
    data: { play_credits_cents: after },
  });
  await tx.walletLedger.create({
    data: {
      user_id: userId,
      bucket: WalletBucket.PLAY,
      amount_cents: -amount,
      balance_after: after,
      kind: WalletLedgerKind.STAKE,
      duel_id: duelId,
    },
  });
}

async function creditChipsInTx(
  tx: TxClient,
  userId: string,
  amount: number,
  duelId: string
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { play_credits_cents: true },
  });
  const after = u.play_credits_cents + amount;
  await tx.user.update({
    where: { id: userId },
    data: { play_credits_cents: after },
  });
  await tx.walletLedger.create({
    data: {
      user_id: userId,
      bucket: WalletBucket.PLAY,
      amount_cents: amount,
      balance_after: after,
      kind: WalletLedgerKind.WIN,
      duel_id: duelId,
    },
  });
}

// ── Room creation + matching ────────────────────────────────────────────────

export async function createChipRoom(
  uid: string,
  chipStake: number,
  categorySlug: string,
  seed: string
): Promise<string> {
  const id = nanoid();
  await prisma.$transaction(async (tx) => {
    await tx.duel.create({
      data: {
        id,
        seed,
        category_slug: categorySlug,
        player1_id: uid,
        status: DuelStatus.pending,
        stake_cents: chipStake,
        is_chip_duel: true,
      },
    });
    await debitChipsInTx(tx, uid, chipStake, id);
    await tx.duel.update({
      where: { id },
      data: {
        player1_staked: true,
        player1_stake_play_cents: chipStake,
      },
    });
  });
  return id;
}

export async function joinChipDuel(
  duelId: string,
  uid: string
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM duels WHERE id = ${duelId} FOR UPDATE`;
      const duel = await tx.duel.findUnique({ where: { id: duelId } });
      if (!duel) throw new JoinError("NOT_FOUND");
      if (!duel.is_chip_duel) throw new JoinError("NOT_CHIP_DUEL");
      if (duel.player1_id === uid) throw new JoinError("SELF_JOIN");
      if (duel.status !== DuelStatus.pending) throw new JoinError("NOT_PENDING");
      if (duel.player2_id !== null) throw new JoinError("ALREADY_TAKEN");

      await debitChipsInTx(tx, uid, duel.stake_cents!, duelId);
      await tx.duel.update({
        where: { id: duelId },
        data: {
          player2_id: uid,
          player2_staked: true,
          player2_stake_play_cents: duel.stake_cents!,
          status: DuelStatus.active,
          started_at: new Date(),
        },
      });
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof JoinError) return { ok: false, code: err.code };
    throw err;
  }
}

class JoinError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

// ── Settlement (zero-sum) ───────────────────────────────────────────────────

/**
 * Settle a completed chip duel: winner gets exactly the loser's staked chips.
 * Called inside the duel completion transaction. Zero-sum — no rake.
 */
export async function settleChipDuelInTx(
  tx: TxClient,
  duelId: string,
  winnerId: string,
  stakeCents: number
): Promise<void> {
  const payout = stakeCents * 2;
  await creditChipsInTx(tx, winnerId, payout, duelId);
  await tx.duel.update({
    where: { id: duelId },
    data: { payout_settled: true, payout_cents: payout },
  });
}

/**
 * Refund a chip duel — return both players' stakes from play_credits_cents.
 */
export async function refundChipDuelInTx(
  tx: TxClient,
  duelId: string,
  player1Id: string,
  player1Stake: number,
  player2Id: string | null,
  player2Stake: number
): Promise<void> {
  if (player1Stake > 0) {
    await creditChipsInTx(tx, player1Id, player1Stake, duelId);
  }
  if (player2Id && player2Stake > 0) {
    await creditChipsInTx(tx, player2Id, player2Stake, duelId);
  }
  await tx.duel.update({
    where: { id: duelId },
    data: { refunded: true },
  });
}

// ── Lobby ───────────────────────────────────────────────────────────────────

export interface OpenChipDuel {
  id: string;
  stakeCents: number;
  createdAt: Date;
  creatorName: string | null;
}

export async function findOpenChipDuels(opts: {
  stakeCents?: number;
  excludeUserId?: string;
  limit?: number;
}): Promise<OpenChipDuel[]> {
  const rows = await prisma.duel.findMany({
    where: {
      status: DuelStatus.pending,
      is_chip_duel: true,
      player2_id: null,
      ...(opts.stakeCents != null ? { stake_cents: opts.stakeCents } : {}),
      ...(opts.excludeUserId ? { player1_id: { not: opts.excludeUserId } } : {}),
    },
    orderBy: { created_at: "asc" },
    take: opts.limit ?? 20,
    select: {
      id: true,
      stake_cents: true,
      created_at: true,
      player1: { select: { display_name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    stakeCents: r.stake_cents as number,
    createdAt: r.created_at,
    creatorName: r.player1.display_name,
  }));
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface ChipLeaderboardRow {
  userId: string;
  displayName: string | null;
  chipWins: number;
  chipLosses: number;
  winPct: number;
  totalChipsWon: number;
}

interface WinsRow {
  user_id: string;
  display_name: string | null;
  wins: bigint;
  chips_won: bigint;
}

interface LossRow {
  user_id: string;
  losses: bigint;
}

export async function chipLeaderboard(limit = 50): Promise<ChipLeaderboardRow[]> {
  // 1. Top winners aggregated in SQL — no unbounded scan.
  const winsRows = await prisma.$queryRaw<WinsRow[]>`
    SELECT d.winner_id AS user_id,
           u.display_name,
           COUNT(*)            AS wins,
           COALESCE(SUM(d.payout_cents), 0) AS chips_won
      FROM duels d
      JOIN users u ON u.id = d.winner_id
     WHERE d.is_chip_duel   = true
       AND d.status         = 'completed'
       AND d.payout_settled = true
       AND d.winner_id IS NOT NULL
       AND u.display_name IS NOT NULL
     GROUP BY d.winner_id, u.display_name
    HAVING COUNT(*) > 0
     ORDER BY wins DESC, chips_won DESC
     LIMIT ${limit}
  `;

  if (winsRows.length === 0) return [];

  const winnerIds = winsRows.map((r) => r.user_id);

  // 2. Count losses for those users — a user loses when they participated
  //    but were NOT the winner.
  const lossRows = await prisma.$queryRaw<LossRow[]>`
    SELECT sub.user_id, COUNT(*) AS losses
      FROM (
        SELECT d.player1_id AS user_id FROM duels d
         WHERE d.is_chip_duel   = true
           AND d.status         = 'completed'
           AND d.payout_settled = true
           AND d.winner_id IS NOT NULL
           AND d.player1_id != d.winner_id
           AND d.player1_id IN (${Prisma.join(winnerIds)})
        UNION ALL
        SELECT d.player2_id AS user_id FROM duels d
         WHERE d.is_chip_duel   = true
           AND d.status         = 'completed'
           AND d.payout_settled = true
           AND d.winner_id IS NOT NULL
           AND d.player2_id IS NOT NULL
           AND d.player2_id != d.winner_id
           AND d.player2_id IN (${Prisma.join(winnerIds)})
      ) sub
     GROUP BY sub.user_id
  `;

  const lossMap = new Map<string, number>();
  for (const r of lossRows) {
    lossMap.set(r.user_id, Number(r.losses));
  }

  return winsRows.map((r) => {
    const wins = Number(r.wins);
    const losses = lossMap.get(r.user_id) ?? 0;
    const total = wins + losses;
    return {
      userId: r.user_id,
      displayName: r.display_name,
      chipWins: wins,
      chipLosses: losses,
      winPct: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      totalChipsWon: Number(r.chips_won),
    };
  });
}

interface TopEarnerRow {
  display_name: string | null;
}

export async function getChipDuelStats(): Promise<{ totalDuels: number; topEarner: string | null }> {
  const [count, topRows] = await Promise.all([
    prisma.duel.count({
      where: { is_chip_duel: true, status: DuelStatus.completed },
    }),
    prisma.$queryRaw<TopEarnerRow[]>`
      SELECT u.display_name
        FROM duels d
        JOIN users u ON u.id = d.winner_id
       WHERE d.is_chip_duel   = true
         AND d.status         = 'completed'
         AND d.payout_settled = true
         AND d.winner_id IS NOT NULL
       GROUP BY d.winner_id, u.display_name
       ORDER BY SUM(d.payout_cents) DESC
       LIMIT 1
    `,
  ]);

  return {
    totalDuels: count,
    topEarner: topRows.length > 0 ? topRows[0].display_name : null,
  };
}
