/**
 * In-app challenge persistence — targeted 1v1 invitations.
 *
 * A Challenge is separate from a Duel: it tracks the invitation lifecycle
 * (pending → accepted/declined/expired/cancelled). A Duel is only created
 * when the recipient accepts.
 */

import { prisma } from "./client";
import { ChallengeStatus, Challenge, Prisma } from "@prisma/client";

const CHALLENGE_TTL_MS = 24 * 60 * 60_000; // 24 hours
const MAX_PENDING_OUTGOING = 3;

export interface ChallengeWithUsers extends Challenge {
  sender: { id: string; display_name: string | null; username: string | null };
  recipient: { id: string; display_name: string | null; username: string | null };
}

const userSelect = {
  sender: { select: { id: true, display_name: true, username: true } },
  recipient: { select: { id: true, display_name: true, username: true } },
} as const;

// ── Writes ─────────────────────────────────────────────────────────────────

export type CreateChallengeResult =
  | { outcome: "created"; challenge: ChallengeWithUsers }
  | { outcome: "too_many_pending" }
  | { outcome: "duplicate" }
  | { outcome: "self_challenge" }
  | { outcome: "recipient_not_found" };

export async function createChallenge(
  senderId: string,
  recipientId: string,
  categorySlug: string
): Promise<CreateChallengeResult> {
  if (senderId === recipientId) {
    return { outcome: "self_challenge" };
  }

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  if (!recipient) return { outcome: "recipient_not_found" };

  const pendingCount = await prisma.challenge.count({
    where: { sender_id: senderId, status: ChallengeStatus.pending },
  });
  if (pendingCount >= MAX_PENDING_OUTGOING) {
    return { outcome: "too_many_pending" };
  }

  const duplicate = await prisma.challenge.findFirst({
    where: {
      sender_id: senderId,
      recipient_id: recipientId,
      status: ChallengeStatus.pending,
    },
    select: { id: true },
  });
  if (duplicate) return { outcome: "duplicate" };

  const challenge = await prisma.challenge.create({
    data: {
      sender_id: senderId,
      recipient_id: recipientId,
      category_slug: categorySlug,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
    include: userSelect,
  });

  return { outcome: "created", challenge };
}

export type AcceptChallengeResult =
  | { outcome: "accepted"; challenge: ChallengeWithUsers }
  | { outcome: "not_found" }
  | { outcome: "not_recipient" }
  | { outcome: "not_pending" };

export async function acceptChallenge(
  id: string,
  userId: string
): Promise<AcceptChallengeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM challenges WHERE id = ${id} FOR UPDATE`;

    const current = await tx.challenge.findUnique({
      where: { id },
      include: userSelect,
    });
    if (!current) return { outcome: "not_found" };
    if (current.recipient_id !== userId) return { outcome: "not_recipient" };
    if (current.status !== ChallengeStatus.pending) return { outcome: "not_pending" };

    const challenge = await tx.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.accepted },
      include: userSelect,
    });

    return { outcome: "accepted", challenge };
  });
}

export type DeclineChallengeResult =
  | { outcome: "declined" }
  | { outcome: "not_found" }
  | { outcome: "not_recipient" }
  | { outcome: "not_pending" };

export async function declineChallenge(
  id: string,
  userId: string
): Promise<DeclineChallengeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM challenges WHERE id = ${id} FOR UPDATE`;

    const current = await tx.challenge.findUnique({ where: { id } });
    if (!current) return { outcome: "not_found" };
    if (current.recipient_id !== userId) return { outcome: "not_recipient" };
    if (current.status !== ChallengeStatus.pending) return { outcome: "not_pending" };

    await tx.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.declined },
    });

    return { outcome: "declined" };
  });
}

export type CancelChallengeResult =
  | { outcome: "cancelled" }
  | { outcome: "not_found" }
  | { outcome: "not_sender" }
  | { outcome: "not_pending" };

export async function cancelChallenge(
  id: string,
  userId: string
): Promise<CancelChallengeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM challenges WHERE id = ${id} FOR UPDATE`;

    const current = await tx.challenge.findUnique({ where: { id } });
    if (!current) return { outcome: "not_found" };
    if (current.sender_id !== userId) return { outcome: "not_sender" };
    if (current.status !== ChallengeStatus.pending) return { outcome: "not_pending" };

    await tx.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.cancelled },
    });

    return { outcome: "cancelled" };
  });
}

/**
 * Link a duel id to an accepted challenge. Called after the duel is created
 * from an accepted challenge so both records are linked.
 */
export async function linkDuelToChallenge(
  challengeId: string,
  duelId: string
): Promise<void> {
  await prisma.challenge.update({
    where: { id: challengeId },
    data: { duel_id: duelId },
  });
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getChallenge(id: string): Promise<ChallengeWithUsers | null> {
  return prisma.challenge.findUnique({
    where: { id },
    include: userSelect,
  });
}

export async function getPendingChallengesForUser(
  userId: string
): Promise<ChallengeWithUsers[]> {
  return prisma.challenge.findMany({
    where: {
      status: ChallengeStatus.pending,
      OR: [{ sender_id: userId }, { recipient_id: userId }],
    },
    include: userSelect,
    orderBy: { created_at: "desc" },
    take: 20,
  });
}

// ── Cron ───────────────────────────────────────────────────────────────────

export interface ExpiredChallenge {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender: { display_name: string | null };
  recipient: { display_name: string | null };
}

export async function reapExpiredChallenges(limit = 200): Promise<{
  count: number;
  challenges: ExpiredChallenge[];
}> {
  const expired = await prisma.challenge.findMany({
    where: {
      status: ChallengeStatus.pending,
      expires_at: { lt: new Date() },
    },
    select: {
      id: true,
      sender_id: true,
      recipient_id: true,
      sender: { select: { display_name: true } },
      recipient: { select: { display_name: true } },
    },
    take: limit,
  });

  if (expired.length === 0) return { count: 0, challenges: [] };

  const ids = expired.map((c) => c.id);
  await prisma.challenge.updateMany({
    where: { id: { in: ids }, status: ChallengeStatus.pending },
    data: { status: ChallengeStatus.expired },
  });

  return { count: expired.length, challenges: expired };
}
