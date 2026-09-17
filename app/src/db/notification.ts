/**
 * Notification persistence — in-app notification feed.
 */

import { prisma } from "./client";
import { NotificationType, Notification } from "@prisma/client";
import type { JsonValue } from "@prisma/client/runtime/library";

// ── Writes ─────────────────────────────────────────────────────────────────

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: JsonValue;
}): Promise<Notification> {
  return prisma.notification.create({
    data: {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? undefined,
    },
  });
}

export async function markNotificationsRead(
  userId: string,
  ids: string[]
): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      id: { in: ids },
      user_id: userId,
      read: false,
    },
    data: { read: true },
  });
  return result.count;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { user_id: userId, read: false },
    data: { read: true },
  });
  return result.count;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getNotifications(
  userId: string,
  take = 20,
  cursor?: string
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take,
    ...(cursor
      ? { cursor: { id: cursor }, skip: 1 }
      : {}),
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { user_id: userId, read: false },
  });
}
