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

export async function chipLeaderboard(limit = 50): Promise<ChipLeaderboardRow[]> {
  const duels = await prisma.duel.findMany({
    where: {
      is_chip_duel: true,
      status: DuelStatus.completed,
      payout_settled: true,
      winner_id: { not: null },
    },
    select: {
      player1_id: true,
      player2_id: true,
      winner_id: true,
      payout_cents: true,
      player1: { select: { id: true, display_name: true } },
      player2: { select: { id: true, display_name: true } },
    },
  });

  const map = new Map<string, { displayName: string | null; wins: number; losses: number; chipsWon: number }>();

  for (const d of duels) {
    const players = [
      { id: d.player1_id, name: d.player1.display_name },
      ...(d.player2_id && d.player2 ? [{ id: d.player2_id, name: d.player2.display_name }] : []),
    ];
    for (const p of players) {
      if (!map.has(p.id)) map.set(p.id, { displayName: p.name, wins: 0, losses: 0, chipsWon: 0 });
      const s = map.get(p.id)!;
      if (p.name !== null) s.displayName = p.name;
      if (d.winner_id === p.id) {
        s.wins++;
        s.chipsWon += d.payout_cents ?? 0;
      } else {
        s.losses++;
      }
    }
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.displayName !== null && v.wins > 0)
    .map(([userId, v]) => {
      const total = v.wins + v.losses;
      return {
        userId,
        displayName: v.displayName,
        chipWins: v.wins,
        chipLosses: v.losses,
        winPct: total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0,
        totalChipsWon: v.chipsWon,
      };
    })
    .sort((a, b) => b.chipWins - a.chipWins || b.totalChipsWon - a.totalChipsWon)
    .slice(0, limit);
}

export async function getChipDuelStats(): Promise<{ totalDuels: number; topEarner: string | null }> {
  const [count, top] = await Promise.all([
    prisma.duel.count({
      where: { is_chip_duel: true, status: DuelStatus.completed },
    }),
    prisma.duel.findMany({
      where: {
        is_chip_duel: true,
        status: DuelStatus.completed,
        payout_settled: true,
        winner_id: { not: null },
      },
      select: { winner_id: true, payout_cents: true, winner: { select: { display_name: true } } },
    }),
  ]);

  let topName: string | null = null;
  if (top.length > 0) {
    const earningsMap = new Map<string, { name: string | null; total: number }>();
    for (const d of top) {
      if (!d.winner_id) continue;
      const prev = earningsMap.get(d.winner_id) ?? { name: null, total: 0 };
      prev.name = d.winner?.display_name ?? prev.name;
      prev.total += d.payout_cents ?? 0;
      earningsMap.set(d.winner_id, prev);
    }
    let best: { name: string | null; total: number } | null = null;
    for (const v of earningsMap.values()) {
      if (!best || v.total > best.total) best = v;
    }
    topName = best?.name ?? null;
  }

  return { totalDuels: count, topEarner: topName };
}
