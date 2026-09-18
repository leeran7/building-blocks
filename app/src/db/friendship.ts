/**
 * Friendship persistence — friend requests and accepted friendships.
 *
 * All writes use discriminated unions so route handlers can map outcomes to
 * structured HTTP responses without catching exceptions for business logic.
 */

import { prisma } from "./client";
import { FriendshipStatus, Friendship } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

interface FriendUser {
  id: string;
  displayName: string | null;
  username: string | null;
}

export interface FriendEntry {
  id: string;
  user: FriendUser;
}

export interface PendingRequestEntry {
  id: string;
  sender: FriendUser;
  createdAt: Date;
}

export interface OutgoingRequestEntry {
  id: string;
  receiver: FriendUser;
  createdAt: Date;
}

export type SendFriendRequestResult =
  | { ok: true; friendship: Friendship }
  | { ok: false; code: "self" | "already_friends" | "already_pending" | "blocked" | "not_found" };

export type AcceptFriendRequestResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "not_receiver" | "not_pending" };

export type DeclineFriendRequestResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "not_receiver" | "not_pending" };

export type RemoveFriendResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "not_party" };

const userSelect = {
  select: { id: true, display_name: true, username: true },
} as const;

// ── Writes ────────────────────────────────────────────────────────────────

export async function sendFriendRequest(
  senderId: string,
  receiverId: string
): Promise<SendFriendRequestResult> {
  if (senderId === receiverId) {
    return { ok: false, code: "self" };
  }

  return prisma.$transaction(async (tx) => {
    // Verify receiver exists
    const receiver = await tx.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) {
      return { ok: false, code: "not_found" as const };
    }

    // Check both directions for any existing friendship
    const existing = await tx.friendship.findMany({
      where: {
        OR: [
          { sender_id: senderId, receiver_id: receiverId },
          { sender_id: receiverId, receiver_id: senderId },
        ],
      },
      take: 1,
    });

    if (existing.length > 0) {
      const f = existing[0];
      if (f.status === FriendshipStatus.blocked) {
        return { ok: false, code: "blocked" as const };
      }
      if (f.status === FriendshipStatus.accepted) {
        return { ok: false, code: "already_friends" as const };
      }
      if (f.status === FriendshipStatus.pending) {
        return { ok: false, code: "already_pending" as const };
      }
      // declined — allow re-sending by deleting the old record and creating fresh
      await tx.friendship.delete({ where: { id: f.id } });
    }

    const friendship = await tx.friendship.create({
      data: {
        sender_id: senderId,
        receiver_id: receiverId,
        status: FriendshipStatus.pending,
      },
    });

    return { ok: true as const, friendship };
  });
}

export async function acceptFriendRequest(
  friendshipId: string,
  userId: string
): Promise<AcceptFriendRequestResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM friendships WHERE id = ${friendshipId} FOR UPDATE`;

    const current = await tx.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!current) return { ok: false, code: "not_found" as const };
    if (current.receiver_id !== userId) return { ok: false, code: "not_receiver" as const };
    if (current.status !== FriendshipStatus.pending) return { ok: false, code: "not_pending" as const };

    await tx.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.accepted },
    });

    return { ok: true as const };
  });
}

export async function declineFriendRequest(
  friendshipId: string,
  userId: string
): Promise<DeclineFriendRequestResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM friendships WHERE id = ${friendshipId} FOR UPDATE`;

    const current = await tx.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!current) return { ok: false, code: "not_found" as const };
    if (current.receiver_id !== userId) return { ok: false, code: "not_receiver" as const };
    if (current.status !== FriendshipStatus.pending) return { ok: false, code: "not_pending" as const };

    await tx.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.declined },
    });

    return { ok: true as const };
  });
}

export async function removeFriend(
  friendshipId: string,
  userId: string
): Promise<RemoveFriendResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM friendships WHERE id = ${friendshipId} FOR UPDATE`;

    const current = await tx.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!current) return { ok: false, code: "not_found" as const };
    if (current.sender_id !== userId && current.receiver_id !== userId) {
      return { ok: false, code: "not_party" as const };
    }

    await tx.friendship.delete({ where: { id: friendshipId } });

    return { ok: true as const };
  });
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getFriends(userId: string): Promise<FriendEntry[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.accepted,
      OR: [{ sender_id: userId }, { receiver_id: userId }],
    },
    include: {
      sender: userSelect,
      receiver: userSelect,
    },
    orderBy: { updated_at: "desc" },
    take: 100,
  });

  return friendships.map((f) => {
    const other = f.sender_id === userId ? f.receiver : f.sender;
    return {
      id: f.id,
      user: {
        id: other.id,
        displayName: other.display_name,
        username: other.username,
      },
    };
  });
}

export async function getPendingRequests(
  userId: string
): Promise<PendingRequestEntry[]> {
  const requests = await prisma.friendship.findMany({
    where: {
      receiver_id: userId,
      status: FriendshipStatus.pending,
    },
    include: {
      sender: userSelect,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return requests.map((r) => ({
    id: r.id,
    sender: {
      id: r.sender.id,
      displayName: r.sender.display_name,
      username: r.sender.username,
    },
    createdAt: r.created_at,
  }));
}

export async function getOutgoingRequests(
  userId: string
): Promise<OutgoingRequestEntry[]> {
  const requests = await prisma.friendship.findMany({
    where: {
      sender_id: userId,
      status: FriendshipStatus.pending,
    },
    include: {
      receiver: userSelect,
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return requests.map((r) => ({
    id: r.id,
    receiver: {
      id: r.receiver.id,
      displayName: r.receiver.display_name,
      username: r.receiver.username,
    },
    createdAt: r.created_at,
  }));
}

export async function areFriends(
  userId1: string,
  userId2: string
): Promise<boolean> {
  const count = await prisma.friendship.count({
    where: {
      status: FriendshipStatus.accepted,
      OR: [
        { sender_id: userId1, receiver_id: userId2 },
        { sender_id: userId2, receiver_id: userId1 },
      ],
    },
  });
  return count > 0;
}
