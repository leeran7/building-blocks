import { prisma } from "./client";
import { DuelStatus, TournamentStatus, Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { totalRounds } from "../config/tournaments";

type TxClient = Prisma.TransactionClient;

// ── Types ──────────────────────────────────────────────────────────────────

export interface PrizeSlot {
  placement: number;
  amount_cents: number;
}

export interface CreateTournamentInput {
  name: string;
  categorySlug: string;
  entryFeeCents: number;
  prizeStructure: PrizeSlot[];
  bracketSize: number;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  createdByUid: string;
}

export interface TournamentView {
  id: string;
  name: string;
  categorySlug: string;
  entryFeeCents: number;
  prizeStructure: PrizeSlot[];
  bracketSize: number;
  status: TournamentStatus;
  currentRound: number;
  registrationOpensAt: string;
  registrationClosesAt: string;
  startedAt: string | null;
  completedAt: string | null;
  entrantCount: number;
}

export type RegisterResult =
  | { outcome: "registered" }
  | { outcome: "duplicate" }
  | { outcome: "full" }
  | { outcome: "closed" };

export type SeedBracketResult =
  | { outcome: "seeded"; matchCount: number }
  | { outcome: "wrong_status" }
  | { outcome: "insufficient_entrants" };

export type AdvanceRoundResult =
  | { outcome: "advanced"; round: number; matchCount: number }
  | { outcome: "tournament_complete"; placements: { userId: string; placement: number }[] }
  | { outcome: "round_incomplete"; pending: number }
  | { outcome: "wrong_status" };

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getTournament(id: string): Promise<TournamentView | null> {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { _count: { select: { entries: true } } },
  });
  if (!t) return null;
  return toView(t, t._count.entries);
}

export async function listTournaments(opts: {
  status?: TournamentStatus;
  categorySlug?: string;
  limit?: number;
}): Promise<TournamentView[]> {
  const rows = await prisma.tournament.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.categorySlug ? { category_slug: opts.categorySlug } : {}),
    },
    include: { _count: { select: { entries: true } } },
    orderBy: { registration_closes_at: "asc" },
    take: opts.limit ?? 20,
  });
  return rows.map((r) => toView(r, r._count.entries));
}

export async function getTournamentBracket(tournamentId: string) {
  return prisma.duel.findMany({
    where: { tournament_id: tournamentId },
    orderBy: [{ tournament_round: "asc" }, { bracket_position: "asc" }],
    include: {
      player1: { select: { id: true, display_name: true } },
      player2: { select: { id: true, display_name: true } },
      winner: { select: { id: true, display_name: true } },
    },
  });
}

// ── Writes ─────────────────────────────────────────────────────────────────

export async function createTournament(input: CreateTournamentInput) {
  return prisma.tournament.create({
    data: {
      name: input.name,
      category_slug: input.categorySlug,
      entry_fee_cents: input.entryFeeCents,
      prize_structure: input.prizeStructure as unknown as Prisma.JsonArray,
      bracket_size: input.bracketSize,
      registration_opens_at: input.registrationOpensAt,
      registration_closes_at: input.registrationClosesAt,
      created_by_uid: input.createdByUid,
    },
  });
}

export async function registerForTournament(
  tournamentId: string,
  userId: string
): Promise<RegisterResult> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { entries: true } } },
    });
    if (!t) throw new Error("Tournament not found");

    if (t.status !== TournamentStatus.REGISTRATION) {
      return { outcome: "closed" };
    }
    const now = new Date();
    if (now < t.registration_opens_at || now > t.registration_closes_at) {
      return { outcome: "closed" };
    }
    if (t._count.entries >= t.bracket_size) {
      return { outcome: "full" };
    }

    try {
      await tx.tournamentEntry.create({
        data: { tournament_id: tournamentId, user_id: userId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { outcome: "duplicate" };
      }
      throw err;
    }
    return { outcome: "registered" };
  });
}

/**
 * Seed the bracket: assign random seed positions to all entrants and create
 * round-1 Duel rows. Non-power-of-2 entrant counts are padded with byes.
 * Transitions tournament to SEEDED then immediately to IN_PROGRESS.
 */
export async function seedBracket(
  tournamentId: string,
  generateSeed: () => string
): Promise<SeedBracketResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

    if (t.status !== TournamentStatus.REGISTRATION) {
      return { outcome: "wrong_status" };
    }

    const entries = await tx.tournamentEntry.findMany({
      where: { tournament_id: tournamentId },
    });
    if (entries.length < 2) {
      return { outcome: "insufficient_entrants" };
    }

    const shuffled = shuffle(entries);
    for (let i = 0; i < shuffled.length; i++) {
      await tx.tournamentEntry.update({
        where: { id: shuffled[i].id },
        data: { seed_position: i + 1 },
      });
    }

    const matchCount = t.bracket_size / 2;
    for (let pos = 0; pos < matchCount; pos++) {
      const p1Entry = shuffled[pos * 2];
      const p2Entry = shuffled[pos * 2 + 1];
      const isBye = !p1Entry || !p2Entry;
      const duelId = nanoid();
      const seed = generateSeed();

      if (isBye) {
        const realPlayer = p1Entry ?? p2Entry;
        await tx.duel.create({
          data: {
            id: duelId,
            seed,
            category_slug: t.category_slug,
            player1_id: realPlayer.user_id,
            status: DuelStatus.completed,
            tournament_id: tournamentId,
            tournament_round: 1,
            bracket_position: pos,
            is_bye: true,
            winner_id: realPlayer.user_id,
            completed_at: new Date(),
          },
        });
      } else {
        await tx.duel.create({
          data: {
            id: duelId,
            seed,
            category_slug: t.category_slug,
            player1_id: p1Entry.user_id,
            player2_id: p2Entry.user_id,
            status: DuelStatus.active,
            started_at: new Date(),
            tournament_id: tournamentId,
            tournament_round: 1,
            bracket_position: pos,
          },
        });
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.IN_PROGRESS,
        current_round: 1,
        started_at: new Date(),
      },
    });

    return { outcome: "seeded", matchCount };
  });
}

/**
 * After all duels in the current round are resolved, advance winners to the
 * next round by creating new Duel rows. If the current round was the final,
 * mark the tournament complete and assign placements.
 */
export async function advanceRound(
  tournamentId: string,
  generateSeed: () => string
): Promise<AdvanceRoundResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`;
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

    if (t.status !== TournamentStatus.IN_PROGRESS) {
      return { outcome: "wrong_status" };
    }

    const round = t.current_round;
    const roundDuels = await tx.duel.findMany({
      where: { tournament_id: tournamentId, tournament_round: round },
      orderBy: { bracket_position: "asc" },
    });

    const pending = roundDuels.filter(
      (d) => d.status !== DuelStatus.completed && d.status !== DuelStatus.voided
    );
    if (pending.length > 0) {
      return { outcome: "round_incomplete", pending: pending.length };
    }

    const winners = roundDuels.map((d) => d.winner_id).filter(Boolean) as string[];
    const rounds = totalRounds(t.bracket_size);

    if (round >= rounds) {
      const placements = await assignPlacements(tx, tournamentId, t.bracket_size);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: TournamentStatus.COMPLETED, completed_at: new Date() },
      });
      return { outcome: "tournament_complete", placements };
    }

    const nextRound = round + 1;
    const nextMatchCount = winners.length / 2;

    for (let pos = 0; pos < nextMatchCount; pos++) {
      const p1 = winners[pos * 2];
      const p2 = winners[pos * 2 + 1];
      const isBye = !p1 || !p2;
      const duelId = nanoid();
      const seed = generateSeed();

      if (isBye) {
        const realPlayer = p1 ?? p2;
        await tx.duel.create({
          data: {
            id: duelId,
            seed,
            category_slug: t.category_slug,
            player1_id: realPlayer,
            status: DuelStatus.completed,
            tournament_id: tournamentId,
            tournament_round: nextRound,
            bracket_position: pos,
            is_bye: true,
            winner_id: realPlayer,
            completed_at: new Date(),
          },
        });
      } else {
        await tx.duel.create({
          data: {
            id: duelId,
            seed,
            category_slug: t.category_slug,
            player1_id: p1,
            player2_id: p2,
            status: DuelStatus.active,
            started_at: new Date(),
            tournament_id: tournamentId,
            tournament_round: nextRound,
            bracket_position: pos,
          },
        });
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { current_round: nextRound },
    });

    return { outcome: "advanced", round: nextRound, matchCount: nextMatchCount };
  });
}

// ── Entry fee settlement (called from Stripe webhook) ──────────────────────

export async function settleEntryFee(
  tournamentId: string,
  userId: string,
  stripeSessionId: string
): Promise<RegisterResult> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { entries: true } } },
    });
    if (!t) throw new Error("Tournament not found");

    if (t.status !== TournamentStatus.REGISTRATION) {
      return { outcome: "closed" };
    }
    if (t._count.entries >= t.bracket_size) {
      return { outcome: "full" };
    }

    try {
      await tx.tournamentEntry.create({
        data: {
          tournament_id: tournamentId,
          user_id: userId,
          payout_status: "entry_paid",
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { outcome: "duplicate" };
      }
      throw err;
    }

    await tx.creditPurchase.create({
      data: {
        user_id: userId,
        stripe_session_id: stripeSessionId,
        amount_cents: t.entry_fee_cents,
      },
    });

    return { outcome: "registered" };
  });
}

// ── Prize disbursement ─────────────────────────────────────────────────────

export type DisburseResult =
  | { outcome: "transferred"; transferId: string }
  | { outcome: "no_prize" }
  | { outcome: "no_connect_account" }
  | { outcome: "already_transferred" }
  | { outcome: "not_payout_ready" };

export async function disbursePrize(
  tournamentId: string,
  userId: string,
  transferFn: (connectAccountId: string, amountCents: number, tournamentId: string, entryId: string) => Promise<string>,
  isReadyFn: (connectAccountId: string) => Promise<boolean>
): Promise<DisburseResult> {
  const entry = await prisma.tournamentEntry.findFirst({
    where: { tournament_id: tournamentId, user_id: userId },
  });
  if (!entry || !entry.prize_cents || entry.prize_cents <= 0) {
    return { outcome: "no_prize" };
  }
  if (entry.stripe_transfer_id) {
    return { outcome: "already_transferred" };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripe_connect_account_id: true },
  });
  if (!user.stripe_connect_account_id) {
    return { outcome: "no_connect_account" };
  }

  const ready = await isReadyFn(user.stripe_connect_account_id);
  if (!ready) {
    return { outcome: "not_payout_ready" };
  }

  const transferId = await transferFn(
    user.stripe_connect_account_id,
    entry.prize_cents,
    tournamentId,
    entry.id
  );

  await prisma.tournamentEntry.update({
    where: { id: entry.id },
    data: {
      stripe_connect_account_id: user.stripe_connect_account_id,
      stripe_transfer_id: transferId,
      payout_status: "transfer_created",
    },
  });

  return { outcome: "transferred", transferId };
}

export async function updatePayoutStatus(
  transferId: string,
  status: string
): Promise<void> {
  await prisma.tournamentEntry.updateMany({
    where: { stripe_transfer_id: transferId },
    data: { payout_status: status },
  });
}

/**
 * Set prize_cents on entries based on the tournament's prize_structure and
 * each entrant's placement. Called after assignPlacements completes.
 */
export async function assignPrizes(tournamentId: string): Promise<void> {
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { prize_structure: true },
  });
  const structure = t.prize_structure as unknown as PrizeSlot[];

  for (const slot of structure) {
    await prisma.tournamentEntry.updateMany({
      where: { tournament_id: tournamentId, placement: slot.placement },
      data: { prize_cents: slot.amount_cents, payout_status: "pending_onboarding" },
    });
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function toView(
  t: {
    id: string;
    name: string;
    category_slug: string;
    entry_fee_cents: number;
    prize_structure: Prisma.JsonValue;
    bracket_size: number;
    status: TournamentStatus;
    current_round: number;
    registration_opens_at: Date;
    registration_closes_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
  },
  entrantCount: number
): TournamentView {
  return {
    id: t.id,
    name: t.name,
    categorySlug: t.category_slug,
    entryFeeCents: t.entry_fee_cents,
    prizeStructure: t.prize_structure as unknown as PrizeSlot[],
    bracketSize: t.bracket_size,
    status: t.status,
    currentRound: t.current_round,
    registrationOpensAt: t.registration_opens_at.toISOString(),
    registrationClosesAt: t.registration_closes_at.toISOString(),
    startedAt: t.started_at?.toISOString() ?? null,
    completedAt: t.completed_at?.toISOString() ?? null,
    entrantCount,
  };
}

async function assignPlacements(
  tx: TxClient,
  tournamentId: string,
  bracketSize: number
): Promise<{ userId: string; placement: number }[]> {
  const rounds = totalRounds(bracketSize);
  const allDuels = await tx.duel.findMany({
    where: { tournament_id: tournamentId },
    orderBy: [{ tournament_round: "desc" }, { bracket_position: "asc" }],
  });

  const placements: { userId: string; placement: number }[] = [];
  const placed = new Set<string>();

  const finalDuel = allDuels.find((d) => d.tournament_round === rounds);
  if (finalDuel?.winner_id) {
    placements.push({ userId: finalDuel.winner_id, placement: 1 });
    placed.add(finalDuel.winner_id);

    const loserId = finalDuel.player1_id === finalDuel.winner_id
      ? finalDuel.player2_id
      : finalDuel.player1_id;
    if (loserId && !placed.has(loserId)) {
      placements.push({ userId: loserId, placement: 2 });
      placed.add(loserId);
    }
  }

  for (let round = rounds - 1; round >= 1; round--) {
    const roundDuels = allDuels.filter((d) => d.tournament_round === round);
    const losers: string[] = [];
    for (const d of roundDuels) {
      if (!d.winner_id) continue;
      const loserId = d.player1_id === d.winner_id ? d.player2_id : d.player1_id;
      if (loserId && !placed.has(loserId)) losers.push(loserId);
    }
    const basePlacement = placed.size + 1;
    for (const loser of losers) {
      placements.push({ userId: loser, placement: basePlacement });
      placed.add(loser);
    }
  }

  for (const p of placements) {
    await tx.tournamentEntry.updateMany({
      where: { tournament_id: tournamentId, user_id: p.userId },
      data: { placement: p.placement },
    });
  }

  return placements;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
