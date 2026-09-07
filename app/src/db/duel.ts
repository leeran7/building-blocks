/**
 * Tower v3 "The Climb" — 1v1 duel persistence.
 *
 * All writes that must be serialized use SELECT FOR UPDATE inside a
 * $transaction so concurrent submissions cannot race. No string-interpolated
 * SQL — every raw query uses tagged-template $queryRaw / $executeRaw.
 */

import { prisma } from "./client";
import { DuelStatus, Duel, DuelStats, Prisma } from "@prisma/client";

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

    return { outcome: "completed", duel } satisfies CompleteDuelResult;
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

/** Return shape from completeDuel. */
export type CompleteDuelResult =
  | { outcome: "completed"; duel: Duel }
  | { outcome: "already_resolved"; duel: Duel };

/** Possible results from voidDuelForForfeit. */
export type VoidForForfeitResult =
  | { outcome: "voided"; duel: Duel; winnerId: string | null; loserId: string | null }
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

    return {
      outcome: "voided",
      duel,
      winnerId,
      loserId: winnerId === opts.player1Id ? opts.player2Id : opts.player1Id,
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
