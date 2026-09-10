/**
 * Tower v3 "The Climb" — 1v1 duel persistence.
 *
 * All writes that must be serialized use SELECT FOR UPDATE inside a
 * $transaction so concurrent submissions cannot race. No string-interpolated
 * SQL — every raw query uses tagged-template $queryRaw / $executeRaw.
 */

import { prisma } from "./client";
import { DuelStatus, Duel, DuelStats, Prisma } from "@prisma/client";
import { creditWinningsInTx, creditRefundInTx, stakeInTx } from "./credits";
import { DUEL_RAKE, duelPayoutCents } from "../config/paidDuel";

// Re-export so that existing imports from db/duel continue to work.
export { DUEL_RAKE, duelPayoutCents };

type TxClientLocal = Prisma.TransactionClient;

/**
 * Credit a paid duel's pot to the winner's WINNINGS bucket, exactly once.
 * Called inside the resolving transaction (completeDuel / voidDuelForForfeit),
 * which already holds the duel row lock. Returns the payout, or null for a free
 * duel / when already settled with no amount.
 *
 * Invariants:
 *  - free duel (stake_cents == null) → no-op, return null.
 *  - payout_settled already true → idempotent, return the recorded payout_cents.
 *  - winnerId == null → caller must refund instead (never pay out a no-winner duel).
 *  - a "guest:" winner is impossible in a paid duel (guests are barred at stake
 *    time); if one appears it is a broken invariant, so we throw loudly.
 */
async function settlePayoutInTx(
  tx: TxClientLocal,
  duel: Duel,
  winnerId: string | null
): Promise<number | null> {
  if (duel.stake_cents == null) return null;
  if (duel.payout_settled) return duel.payout_cents ?? null;
  if (winnerId == null) return null;
  if (winnerId.startsWith("guest:")) {
    throw new Error(`Paid duel ${duel.id} resolved to a guest winner — invariant violation`);
  }

  const payout = duelPayoutCents(duel.stake_cents);
  await creditWinningsInTx(tx, winnerId, payout, duel.id);
  await tx.duel.update({
    where: { id: duel.id },
    data: { payout_settled: true, payout_cents: payout },
  });
  return payout;
}

/**
 * Return both players' stakes to the exact buckets they came from, exactly once.
 * Used when a paid duel never produced a played result (cancel / opponent never
 * joined / stale-reap with no winner). Called inside a transaction holding the
 * duel row lock.
 */
async function claimRefundInTx(tx: TxClientLocal, duel: Duel): Promise<boolean> {
  if (duel.stake_cents == null || duel.refunded) return false;

  if (duel.player1_staked) {
    await creditRefundInTx(
      tx,
      duel.player1_id,
      duel.player1_stake_play_cents,
      duel.player1_stake_winnings_cents,
      duel.id
    );
  }
  if (duel.player2_staked && duel.player2_id) {
    await creditRefundInTx(
      tx,
      duel.player2_id,
      duel.player2_stake_play_cents,
      duel.player2_stake_winnings_cents,
      duel.id
    );
  }

  await tx.duel.update({ where: { id: duel.id }, data: { refunded: true } });
  return true;
}

/**
 * Public wrapper: refund a paid duel by id (used by the cancel path once a
 * pending challenge is voided). Idempotent via the `refunded` guard.
 */
export async function refundPaidDuel(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;
    const duel = await tx.duel.findUnique({ where: { id } });
    if (!duel) return false;
    return claimRefundInTx(tx, duel);
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompleteDuelInput {
  winnerId: string | null;
  player1Peak: number;
  player2Peak: number;
  /** Optional: replay tokens are stored via markPlayerSubmitted; pass here to overwrite. */
  player1Replay?: string | null;
  /** Optional: replay tokens are stored via markPlayerSubmitted; pass here to overwrite. */
  player2Replay?: string | null;
  tiebreakRule: string | null;
}

/** Overrides allowed when creating a duel in a pre-paired (active) state. */
export interface CreateDuelOptions {
  /** Pre-assign player2 when both players are known at creation time (matchmaking). */
  player2Id?: string;
  /** Override the default "pending" status (use "active" for matchmaking pairs). */
  status?: DuelStatus;
}

/** Return shape from joinDuel. */
export type JoinDuelResult =
  | { outcome: "joined"; duel: Duel }
  | { outcome: "already_joined" };

/** Return shape from markPlayerSubmitted. */
export interface MarkSubmittedResult {
  duel: Duel;
  bothSubmitted: boolean;
  /** True when the player already submitted this slot; the replay was NOT overwritten. */
  alreadySubmitted: boolean;
}

export interface DuelWithPlayers extends Duel {
  player1: { id: string; display_name: string | null };
  player2: { id: string; display_name: string | null } | null;
  winner: { id: string; display_name: string | null } | null;
}

export interface DuelStatsRow {
  userId: string;
  displayName: string | null;
  wins: number;
  losses: number;
  winPct: number;
}

export interface PaidDuelStatsRow {
  userId: string;
  displayName: string | null;
  paidWins: number;
  paidLosses: number;
  winPct: number;
  totalPayoutCents: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Shared select shape for player display names. */
const playerSelect = {
  player1: { select: { id: true, display_name: true } },
  player2: { select: { id: true, display_name: true } },
  winner: { select: { id: true, display_name: true } },
} as const;

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Create a new duel. The caller supplies the id (cuid or nanoid) so the API
 * can return it before any DB round-trip is needed. Pass opts.player2Id and
 * opts.status = "active" when both players are known at creation time
 * (matchmaking fast-path).
 */
export async function createDuel(
  player1Id: string,
  categorySlug: string,
  id: string,
  seed: string,
  opts: CreateDuelOptions = {}
): Promise<Duel> {
  return prisma.duel.create({
    data: {
      id,
      seed,
      category_slug: categorySlug,
      player1_id: player1Id,
      player2_id: opts.player2Id ?? null,
      status: opts.status ?? DuelStatus.pending,
      ...(opts.status === DuelStatus.active ? { started_at: new Date() } : {}),
    },
  });
}

/**
 * Accept a duel challenge: bind player2 and transition to active.
 * Uses SELECT FOR UPDATE to prevent two concurrent joins from both succeeding.
 * Returns { outcome: "already_joined" } when the duel is already taken.
 */
export async function joinDuel(id: string, player2Id: string): Promise<JoinDuelResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;

    const current = await tx.duel.findUniqueOrThrow({ where: { id } });

    if (current.status !== DuelStatus.pending || current.player2_id !== null) {
      return { outcome: "already_joined" } satisfies JoinDuelResult;
    }

    const duel = await tx.duel.update({
      where: { id },
      data: {
        player2_id: player2Id,
        status: DuelStatus.active,
        started_at: new Date(),
      },
    });

    return { outcome: "joined", duel } satisfies JoinDuelResult;
  });
}

/**
 * Fetch a duel with player/winner display names, or null if it doesn't exist.
 */
export async function getDuel(id: string): Promise<DuelWithPlayers | null> {
  return prisma.duel.findUnique({
    where: { id },
    include: playerSelect,
  });
}

/**
 * Fetch all duels where the user is player1, optionally filtered by status.
 */
export async function getDuelsByPlayer1(
  player1Id: string,
  status?: DuelStatus
): Promise<Duel[]> {
  return prisma.duel.findMany({
    where: {
      player1_id: player1Id,
      ...(status !== undefined ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });
}

/**
 * The user's most recent ACTIVE duel (as either player), created within the
 * given window. Used by the queue status poll so a waiting player can discover
 * they were matched (the pairing happens in the *other* player's request, which
 * creates an active duel with this user as player1).
 */
export async function getActiveDuelForUser(
  userId: string,
  withinSeconds = 600
): Promise<Duel | null> {
  const since = new Date(Date.now() - withinSeconds * 1000);
  return prisma.duel.findFirst({
    where: {
      status: DuelStatus.active,
      created_at: { gte: since },
      OR: [{ player1_id: userId }, { player2_id: userId }],
    },
    orderBy: { created_at: "desc" },
  });
}

/**
 * The user's currently in-progress PAID duel, if any — used to block staking
 * into a second match while one is still being played. A much longer window
 * than getActiveDuelForUser's matchmaking default: an active game can run for
 * several minutes, and this check must cover the whole match, not just the
 * few seconds right after pairing.
 */
export async function getActivePaidDuelForUser(userId: string): Promise<Duel | null> {
  return prisma.duel.findFirst({
    where: {
      status: DuelStatus.active,
      stake_cents: { not: null },
      OR: [{ player1_id: userId }, { player2_id: userId }],
    },
    orderBy: { created_at: "desc" },
  });
}

/**
 * Complete a duel atomically. Uses SELECT FOR UPDATE so concurrent result
 * submissions (e.g. both players submit at the same millisecond) are
 * serialized and only the first write wins.
 *
 * SEC-1: Re-checks that status is still ACTIVE inside the lock so a voided
 * duel cannot be overwritten.
 * C-1: Returns { outcome: "already_resolved" } for idempotency when the
 * duel was already completed or voided by a concurrent request.
 * SEC-2: Calls upsertDuelStats for both players inside the same transaction
 * so wins/losses are updated atomically with the duel completion — a retry
 * cannot double-increment counters.
 */
export async function completeDuel(
  id: string,
  input: CompleteDuelInput & { player1Id: string; player2Id: string }
): Promise<CompleteDuelResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the row so no concurrent completeDuel call can race.
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;

    const current = await tx.duel.findUniqueOrThrow({ where: { id } });

    // SEC-1 + C-1: Guard against overwriting a duel that is no longer ACTIVE.
    if (current.status !== DuelStatus.active) {
      return { outcome: "already_resolved", duel: current } satisfies CompleteDuelResult;
    }

    const duel = await tx.duel.update({
      where: { id },
      data: {
        status: DuelStatus.completed,
        winner_id: input.winnerId,
        player1_peak: input.player1Peak,
        player2_peak: input.player2Peak,
        ...(input.player1Replay !== undefined ? { player1_replay: input.player1Replay } : {}),
        ...(input.player2Replay !== undefined ? { player2_replay: input.player2Replay } : {}),
        tiebreak_rule: input.tiebreakRule,
        completed_at: new Date(),
      },
    });

    // SEC-2: Upsert stats atomically inside the same transaction.
    // Skip guest users (prefixed "guest:") — they have no persistent account.
    if (!input.player1Id.startsWith("guest:")) {
      await upsertDuelStatsInTx(tx, input.player1Id, input.winnerId === input.player1Id);
    }
    if (!input.player2Id.startsWith("guest:")) {
      await upsertDuelStatsInTx(tx, input.player2Id, input.winnerId === input.player2Id);
    }

    // Paid duels: credit the pot to the winner's cashable winnings bucket,
    // exactly once, in the same locked transaction as completion.
    const payoutCents = await settlePayoutInTx(tx, duel, input.winnerId);

    return { outcome: "completed", duel, payoutCents } satisfies CompleteDuelResult;
  });
}

/**
 * Void options for explicit forfeit/admin scenarios.
 */
export interface VoidDuelOptions {
  winnerId?: string | null;
  forfeit?: boolean;
  completedAt?: Date;
}

/**
 * Extended options for voidDuelForForfeit — requires player ids so stats can
 * be upserted atomically inside the same transaction (AC-20).
 */
export interface ForfeitVoidOptions extends VoidDuelOptions {
  /** Firebase uid or "guest:<ip>" for player1. */
  player1Id: string;
  /** Firebase uid or "guest:<ip>" for player2. */
  player2Id: string;
}

/**
 * Void a duel. Optionally supply a winner (forfeit) and completedAt timestamp.
 */
export async function voidDuel(id: string, opts: VoidDuelOptions = {}): Promise<Duel> {
  return prisma.duel.update({
    where: { id },
    data: {
      status: DuelStatus.voided,
      forfeit: opts.forfeit ?? true,
      ...(opts.winnerId !== undefined ? { winner_id: opts.winnerId } : {}),
      ...(opts.completedAt !== undefined ? { completed_at: opts.completedAt } : {}),
    },
  });
}

/**
 * Grace window after a duel starts before it's considered abandoned. Comfortably
 * exceeds any real match (the rising lava bounds a climb to a couple of minutes),
 * so a still-live race is never reaped.
 */
export const DUEL_STALE_GRACE_MS = 10 * 60_000;

/**
 * Lazily resolve a stale, abandoned duel (the "silent crash" case: no forfeit
 * signal ever arrived). If the duel is still ACTIVE past the grace window and
 * hasn't had both replays submitted, VOID it with no winner and no stats — we
 * can't fairly pick a winner without both input logs, and an intentional leave
 * would have resolved earlier via the forfeit path. Idempotent + race-safe via
 * SELECT FOR UPDATE. Returns true iff this call reaped it.
 *
 * (Intentional leaves are resolved immediately and correctly by the forfeit
 * beacon → voidDuelForForfeit, which DOES award the opponent + record stats.)
 */
export async function reapDuelIfStale(
  id: string,
  graceMs = DUEL_STALE_GRACE_MS
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;
    const current = await tx.duel.findUnique({ where: { id } });
    if (!current || current.status !== DuelStatus.active) return false;
    if (current.player1_submitted && current.player2_submitted) return false;
    const startedAt = current.started_at ?? current.created_at;
    if (Date.now() - startedAt.getTime() < graceMs) return false;

    const voided = await tx.duel.update({
      where: { id },
      data: { status: DuelStatus.voided, forfeit: false, completed_at: new Date() },
    });
    // Paid duel abandoned with no fair winner (no both-submitted) → refund both
    // stakes to their source buckets in the same locked transaction.
    if (voided.stake_cents != null) {
      await claimRefundInTx(tx, voided);
    }
    return true;
  });
}

/** Grace window before a paid PENDING challenge nobody joined is auto-refunded. */
export const DUEL_PENDING_STALE_GRACE_MS = 30 * 60_000;

/**
 * Void + refund paid PENDING duels the creator staked but no opponent ever
 * joined, older than the grace window, so a payer's credits never leak. Each
 * duel is handled in its own SELECT FOR UPDATE transaction (idempotent via the
 * `refunded` guard). Returns the number of duels refunded. Invoked from the
 * reap cron; a lazy call from GET /api/duel/[id] is the backstop.
 */
export async function reapStalePendingPaidDuels(
  graceMs = DUEL_PENDING_STALE_GRACE_MS,
  limit = 100
): Promise<number> {
  const cutoff = new Date(Date.now() - graceMs);
  const candidates = await prisma.duel.findMany({
    where: {
      status: DuelStatus.pending,
      stake_cents: { not: null },
      refunded: false,
      created_at: { lt: cutoff },
    },
    select: { id: true },
    take: limit,
  });

  let refunded = 0;
  for (const { id } of candidates) {
    const didRefund = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;
      const duel = await tx.duel.findUnique({ where: { id } });
      if (!duel || duel.status !== DuelStatus.pending || duel.refunded) return false;
      await tx.duel.update({
        where: { id },
        data: { status: DuelStatus.voided, completed_at: new Date() },
      });
      return claimRefundInTx(tx, duel);
    });
    if (didRefund) refunded++;
  }
  return refunded;
}

/** Return shape from completeDuel. payoutCents is set for paid duels only. */
export type CompleteDuelResult =
  | { outcome: "completed"; duel: Duel; payoutCents: number | null }
  | { outcome: "already_resolved"; duel: Duel };

/** Possible results from voidDuelForForfeit. payoutCents is set for paid duels only. */
export type VoidForForfeitResult =
  | {
      outcome: "voided";
      duel: Duel;
      winnerId: string | null;
      loserId: string | null;
      payoutCents: number | null;
    }
  | { outcome: "already_resolved" };

/**
 * Atomically check duel status and void it as a forfeit.
 * Returns { outcome: "already_resolved" } when the duel is already
 * COMPLETED or VOIDED so the caller can return 409 without a TOCTOU race.
 *
 * AC-20: Both upsertDuelStats calls run inside this transaction so a
 * crash between them cannot leave stats inconsistent.
 * AC-23: Players with a "guest:" prefix are skipped — no persistent W-L row.
 */
export async function voidDuelForForfeit(
  id: string,
  opts: ForfeitVoidOptions
): Promise<VoidForForfeitResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;

    const current = await tx.duel.findUniqueOrThrow({ where: { id } });

    if (
      current.status === DuelStatus.completed ||
      current.status === DuelStatus.voided
    ) {
      return { outcome: "already_resolved" } satisfies VoidForForfeitResult;
    }

    const duel = await tx.duel.update({
      where: { id },
      data: {
        status: DuelStatus.voided,
        forfeit: opts.forfeit ?? true,
        ...(opts.winnerId !== undefined ? { winner_id: opts.winnerId } : {}),
        ...(opts.completedAt !== undefined ? { completed_at: opts.completedAt } : {}),
      },
    });

    // AC-20: Upsert stats atomically inside the same transaction.
    // AC-23: Skip guest / IP-based users — no persistent duel_stats row.
    const winnerId = opts.winnerId ?? null;
    if (!opts.player1Id.startsWith("guest:")) {
      await upsertDuelStatsInTx(tx, opts.player1Id, winnerId === opts.player1Id);
    }
    if (!opts.player2Id.startsWith("guest:")) {
      await upsertDuelStatsInTx(tx, opts.player2Id, winnerId === opts.player2Id);
    }

    // Paid duels: a forfeit still has a winner (the non-forfeiter), so the pot
    // is paid out to them. If there is somehow no winner, refund both stakes.
    let payoutCents: number | null = null;
    if (duel.stake_cents != null) {
      if (winnerId) {
        payoutCents = await settlePayoutInTx(tx, duel, winnerId);
      } else {
        await claimRefundInTx(tx, duel);
      }
    }

    return {
      outcome: "voided",
      duel,
      winnerId,
      loserId: winnerId === opts.player1Id ? opts.player2Id : opts.player1Id,
      payoutCents,
    } satisfies VoidForForfeitResult;
  });
}

/** Possible results from cancelPendingDuel. */
export type CancelPendingResult =
  | { outcome: "cancelled" }
  | { outcome: "forbidden" }
  | { outcome: "not_pending" }
  | { outcome: "not_found" };

/**
 * Cancel a still-pending challenge the requester created. Lets a player clear
 * an open challenge nobody joined so they are not permanently blocked by the
 * one-pending-challenge-per-user guard in POST /api/duel.
 *
 * Guarded inside SELECT FOR UPDATE:
 *   - only the creator (player1) may cancel — otherwise "forbidden";
 *   - only while status is PENDING and no player2 has joined — otherwise
 *     "not_pending" (a joined/active duel must be forfeited, not silently
 *     cancelled, so it can never erase a match in progress).
 * No stats are touched: a pending duel was never played.
 */
export async function cancelPendingDuel(
  id: string,
  requesterId: string
): Promise<CancelPendingResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;

    const current = await tx.duel.findUnique({ where: { id } });
    if (!current) return { outcome: "not_found" } satisfies CancelPendingResult;
    if (current.player1_id !== requesterId) {
      return { outcome: "forbidden" } satisfies CancelPendingResult;
    }
    if (current.status !== DuelStatus.pending || current.player2_id !== null) {
      return { outcome: "not_pending" } satisfies CancelPendingResult;
    }

    await tx.duel.update({
      where: { id },
      data: { status: DuelStatus.voided },
    });
    // Paid challenge: refund the creator's stake atomically — no second transaction
    // needed, and a crash between void and refund can never orphan credits.
    await claimRefundInTx(tx, current);
    return { outcome: "cancelled" } satisfies CancelPendingResult;
  });
}

/**
 * Mark one player's replay as submitted and store the encoded replay payload.
 * Serialized with SELECT FOR UPDATE so the two concurrent submissions do not
 * race on the row. Returns the updated duel and whether both players have now
 * submitted.
 */
export async function markPlayerSubmitted(
  duelId: string,
  slot: "player1" | "player2",
  replayB64: string
): Promise<MarkSubmittedResult> {
  const { duel, alreadySubmitted } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM duels WHERE id = ${duelId} FOR UPDATE`;

    // Read current state inside the lock so we can detect duplicate submissions.
    const current = await tx.duel.findUniqueOrThrow({ where: { id: duelId } });

    const slotAlreadySubmitted =
      slot === "player1" ? current.player1_submitted : current.player2_submitted;

    if (slotAlreadySubmitted) {
      // Return current row without overwriting — caller will surface 409.
      return { duel: current, alreadySubmitted: true };
    }

    const replayField =
      slot === "player1"
        ? { player1_submitted: true, player1_replay: replayB64 }
        : { player2_submitted: true, player2_replay: replayB64 };

    const updated = await tx.duel.update({
      where: { id: duelId },
      data: replayField,
    });

    return { duel: updated, alreadySubmitted: false };
  });

  const bothSubmitted = duel.player1_submitted && duel.player2_submitted;
  return { duel, bothSubmitted, alreadySubmitted };
}

/**
 * Point a completed duel at its rematch so the opponent can discover the new
 * room by polling meta even if the realtime "rematch" event is dropped. Only
 * writes the pointer once (first rematch wins) to keep both players converging
 * on the same room. Best-effort: never throws into the request path.
 */
export async function recordRematch(originalId: string, rematchDuelId: string): Promise<void> {
  await prisma.duel.updateMany({
    where: { id: originalId, rematch_duel_id: null },
    data: { rematch_duel_id: rematchDuelId },
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────

type TxClient = Prisma.TransactionClient;

/**
 * Internal: upsert win/loss counters inside an existing transaction client.
 * Used by completeDuel so stats are written atomically with the duel row.
 */
async function upsertDuelStatsInTx(
  tx: TxClient,
  userId: string,
  won: boolean
): Promise<void> {
  if (won) {
    await tx.duelStats.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        wins: 1,
        losses: 0,
        current_streak: 1,
        best_streak: 1,
      },
      update: {
        wins: { increment: 1 },
        current_streak: { increment: 1 },
      },
    });
    await tx.$executeRaw`
      UPDATE duel_stats
      SET best_streak = GREATEST(best_streak, current_streak)
      WHERE user_id = ${userId}
    `;
  } else {
    await tx.duelStats.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        wins: 0,
        losses: 1,
        current_streak: 0,
        best_streak: 0,
      },
      update: {
        losses: { increment: 1 },
        current_streak: 0,
      },
    });
  }
}

/**
 * Upsert win/loss counters and streak for a player after a duel completes.
 *
 * Streak logic:
 *   win  → current_streak++ ; best_streak = max(best_streak, current_streak)
 *   loss → current_streak = 0
 *
 * Accepts either a plain boolean or an object { win: boolean } for
 * backwards-compatibility with callers that pass the object form.
 *
 * NOTE: On the normal completion path, this is called inside the completeDuel
 * transaction. This export is kept for the forfeit path (voidDuelForForfeit)
 * which runs its own SELECT FOR UPDATE and calls this separately.
 */
export async function upsertDuelStats(
  userId: string,
  wonOrObj: boolean | { win: boolean }
): Promise<DuelStats> {
  const won = typeof wonOrObj === "boolean" ? wonOrObj : wonOrObj.win;
  await prisma.$transaction(async (tx) => {
    await upsertDuelStatsInTx(tx, userId, won);
  });
  return prisma.duelStats.findUniqueOrThrow({ where: { user_id: userId } });
}

/**
 * Fetch duel stats for a single user, or null if they have never played a duel.
 */
export async function getDuelStats(userId: string): Promise<DuelStats | null> {
  return prisma.duelStats.findUnique({ where: { user_id: userId } });
}

export interface RecentDuelItem {
  id: string;
  status: string;
  categorySlug: string;
  winnerId: string | null;
  forfeit: boolean;
  player1Peak: number | null;
  player2Peak: number | null;
  tiebreakRule: string | null;
  completedAt: string | null;
  hasReplay: boolean;
  opponent: { id: string; displayName: string | null } | null;
  mySlot: 1 | 2;
}

export async function getRecentDuelsForUser(
  userId: string,
  take = 10
): Promise<RecentDuelItem[]> {
  const rows = await prisma.duel.findMany({
    where: {
      status: DuelStatus.completed,
      OR: [{ player1_id: userId }, { player2_id: userId }],
    },
    orderBy: { completed_at: "desc" },
    take,
    select: {
      id: true,
      status: true,
      category_slug: true,
      winner_id: true,
      forfeit: true,
      player1_peak: true,
      player2_peak: true,
      tiebreak_rule: true,
      completed_at: true,
      player1_replay: true,
      player2_replay: true,
      player1: { select: { id: true, display_name: true } },
      player2: { select: { id: true, display_name: true } },
      player1_id: true,
      player2_id: true,
    },
  });

  return rows.map((r) => {
    const isP1 = r.player1_id === userId;
    const opponent = isP1
      ? (r.player2 ? { id: r.player2.id, displayName: r.player2.display_name } : null)
      : (r.player1 ? { id: r.player1.id, displayName: r.player1.display_name } : null);
    const hasReplay = isP1 ? !!r.player1_replay : !!r.player2_replay;
    return {
      id: r.id,
      status: r.status,
      categorySlug: r.category_slug,
      winnerId: r.winner_id ?? null,
      forfeit: r.forfeit ?? false,
      player1Peak: r.player1_peak ?? null,
      player2Peak: r.player2_peak ?? null,
      tiebreakRule: r.tiebreak_rule ?? null,
      completedAt: r.completed_at?.toISOString() ?? null,
      hasReplay,
      opponent,
      mySlot: isP1 ? 1 : 2,
    };
  });
}

/**
 * Top paid-duel leaderboard by paid wins. Aggregates directly from the duels
 * table (stake_cents IS NOT NULL) so free and paid records are kept separate.
 * Only settled (payout_settled=true) completed duels count.
 */
export async function topPaidDuelStats(limit = 50): Promise<PaidDuelStatsRow[]> {
  const duels = await prisma.duel.findMany({
    where: {
      stake_cents: { not: null },
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

  const map = new Map<string, { displayName: string | null; wins: number; losses: number; payout: number }>();

  for (const d of duels) {
    const players = [
      { id: d.player1_id, name: d.player1.display_name },
      ...(d.player2_id && d.player2 ? [{ id: d.player2_id, name: d.player2.display_name }] : []),
    ];
    for (const p of players) {
      if (!map.has(p.id)) map.set(p.id, { displayName: p.name, wins: 0, losses: 0, payout: 0 });
      const s = map.get(p.id)!;
      if (p.name !== null) s.displayName = p.name;
      if (d.winner_id === p.id) {
        s.wins++;
        s.payout += d.payout_cents ?? 0;
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
        paidWins: v.wins,
        paidLosses: v.losses,
        winPct: total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0,
        totalPayoutCents: v.payout,
      };
    })
    .sort((a, b) => b.paidWins - a.paidWins || b.totalPayoutCents - a.totalPayoutCents)
    .slice(0, limit);
}

/**
 * Top duel leaderboard by wins. Excludes anonymous users (no display_name).
 * winPct = wins / (wins + losses) * 100, rounded to 1 decimal.
 */
export async function topDuelStats(limit = 50): Promise<DuelStatsRow[]> {
  const rows = await prisma.duelStats.findMany({
    where: {
      user: { display_name: { not: null } },
    },
    orderBy: { wins: "desc" },
    take: limit,
    select: {
      user_id: true,
      wins: true,
      losses: true,
      user: { select: { display_name: true } },
    },
  });

  return rows.map((r) => {
    const total = r.wins + r.losses;
    const winPct = total > 0 ? Math.round((r.wins / total) * 1000) / 10 : 0;
    return {
      userId: r.user_id,
      displayName: r.user.display_name,
      wins: r.wins,
      losses: r.losses,
      winPct,
    };
  });
}

// ─────────────────────── Paid per-tier queue / lobby ───────────────────────
//
// A pending paid duel row (stake_cents set, player2_id null) IS a queue slot:
// the creator's stake is already escrowed and refundable, and joining it is the
// same atomic SELECT FOR UPDATE that starts any paid match. So the "queue" is
// just these rows, matched oldest-first per stake tier — no separate escrow.

/** Discriminated join failures, so callers map to precise HTTP codes. */
export type JoinPaidCode =
  | "NOT_FOUND"
  | "NOT_PAID"
  | "NOT_PENDING"
  | "SELF_JOIN"
  | "ALREADY_TAKEN";

export type JoinPaidOutcome = { ok: true } | { ok: false; code: JoinPaidCode };

class JoinPaidError extends Error {
  constructor(public readonly code: JoinPaidCode) {
    super(code);
  }
}

/**
 * Bind `uid` as player2 of a pending paid duel: stake their credits and flip it
 * to `active` in ONE SELECT FOR UPDATE transaction, so both stakes are escrowed
 * the instant the match starts. Shared by the direct-link join route and the
 * public per-tier matchmaker.
 *
 * Returns a discriminated outcome for expected states; throws
 * InsufficientCreditsError (rolling back) when the joiner is short.
 */
export async function joinPaidDuel(id: string, uid: string): Promise<JoinPaidOutcome> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM duels WHERE id = ${id} FOR UPDATE`;
      const duel = await tx.duel.findUnique({ where: { id } });

      if (!duel) throw new JoinPaidError("NOT_FOUND");
      if (duel.stake_cents == null) throw new JoinPaidError("NOT_PAID");
      if (duel.player1_id === uid) throw new JoinPaidError("SELF_JOIN");
      if (duel.status !== DuelStatus.pending) throw new JoinPaidError("NOT_PENDING");
      if (duel.player2_id !== null && duel.player2_id !== uid) {
        throw new JoinPaidError("ALREADY_TAKEN");
      }

      const split = await stakeInTx(tx, uid, duel.stake_cents, id);
      await tx.duel.update({
        where: { id },
        data: {
          player2_id: uid,
          player2_staked: true,
          player2_stake_play_cents: split.playDebited,
          player2_stake_winnings_cents: split.winningsDebited,
          status: DuelStatus.active,
          started_at: new Date(),
        },
      });
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof JoinPaidError) return { ok: false, code: err.code };
    throw err; // InsufficientCreditsError or unexpected — caller handles.
  }
}

/**
 * Thrown when the creator already has another open paid room. The DB-level
 * partial unique index (duel_one_open_paid_room_per_user) is the actual
 * enforcement — this wraps that constraint violation so callers get the
 * existing room id instead of a raw Postgres error. A pre-check in the route
 * handles the common case; this is the race-proof backstop.
 */
export class DuplicateOpenPaidRoomError extends Error {
  constructor(public readonly existingId: string) {
    super("DUEL_ALREADY_PENDING");
  }
}

/**
 * Create a pending paid challenge (a public waiting room) with the creator's
 * stake escrowed. Escrow row is created first so the STAKE ledger can reference
 * it, then the debit + bucket split are recorded. Throws
 * InsufficientCreditsError (rolling back) when the creator is short, or
 * DuplicateOpenPaidRoomError (rolling back, no debit) when the creator already
 * has an open room — two concurrent create calls both pass the app-level
 * pre-check, but only one wins the DB constraint; the loser gets a clean error
 * instead of a second stake.
 */
export async function createPaidRoom(
  uid: string,
  stakeCents: number,
  categorySlug: string,
  id: string,
  seed: string
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.duel.create({
        data: {
          id,
          seed,
          category_slug: categorySlug,
          player1_id: uid,
          status: DuelStatus.pending,
          stake_cents: stakeCents,
        },
      });
      const split = await stakeInTx(tx, uid, stakeCents, id);
      await tx.duel.update({
        where: { id },
        data: {
          player1_staked: true,
          player1_stake_play_cents: split.playDebited,
          player1_stake_winnings_cents: split.winningsDebited,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await getOpenPaidDuelForUser(uid);
      throw new DuplicateOpenPaidRoomError(existing?.id ?? id);
    }
    throw err;
  }
}

export interface OpenPaidDuel {
  id: string;
  stakeCents: number;
  createdAt: Date;
  creatorId: string;
  creatorName: string | null;
}

/**
 * Open (pending, unjoined) paid challenges, oldest first — the joinable lobby.
 * Optionally filtered to a stake tier and excluding one user (yourself).
 */
export async function findOpenPaidDuels(opts: {
  stakeCents?: number;
  excludeUserId?: string;
  limit?: number;
}): Promise<OpenPaidDuel[]> {
  const rows = await prisma.duel.findMany({
    where: {
      status: DuelStatus.pending,
      player2_id: null,
      stake_cents: opts.stakeCents != null ? opts.stakeCents : { not: null },
      ...(opts.excludeUserId ? { player1_id: { not: opts.excludeUserId } } : {}),
    },
    orderBy: { created_at: "asc" },
    take: opts.limit ?? 20,
    select: {
      id: true,
      stake_cents: true,
      created_at: true,
      player1_id: true,
      player1: { select: { display_name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    stakeCents: r.stake_cents as number,
    createdAt: r.created_at,
    creatorId: r.player1_id,
    creatorName: r.player1.display_name,
  }));
}

/** The user's own open paid waiting room, if any (one-open-per-user invariant). */
export async function getOpenPaidDuelForUser(
  uid: string
): Promise<{ id: string; stakeCents: number } | null> {
  const d = await prisma.duel.findFirst({
    where: {
      player1_id: uid,
      status: DuelStatus.pending,
      stake_cents: { not: null },
      player2_id: null,
    },
    orderBy: { created_at: "desc" },
    select: { id: true, stake_cents: true },
  });
  return d ? { id: d.id, stakeCents: d.stake_cents as number } : null;
}

/**
 * Status of the paid room this user most recently CREATED (as player1), for
 * the matchmaker's waiting-room poll.
 *
 * Deliberately scoped to rooms the user created, not "any active duel they're
 * in": joining an opponent's room already returns "matched" synchronously from
 * the POST that performs the join, so polling is only ever needed for the
 * other half — waiting for someone to join *your* room. Checking the specific
 * room you created (rather than any recent active duel you're a participant
 * in) avoids reporting an unrelated stale match as "matched".
 */
export async function getOwnPaidRoomStatus(
  uid: string
): Promise<{ id: string; status: DuelStatus; stakeCents: number } | null> {
  const d = await prisma.duel.findFirst({
    where: { player1_id: uid, stake_cents: { not: null } },
    orderBy: { created_at: "desc" },
    select: { id: true, status: true, stake_cents: true },
  });
  return d ? { id: d.id, status: d.status, stakeCents: d.stake_cents as number } : null;
}
