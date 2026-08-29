/**
 * Analytics snapshot data access (Epic K). Idempotent upsert keyed on
 * (item|account, day) is what satisfies AC-44 — re-running the same day's
 * refresh never creates a duplicate row.
 */

import { prisma } from "../client";
import { sanitizeForStorage } from "../../social/services/safety";
import type { AnalyticsResult } from "../../social/providers/types";

function dayOnly(date: Date): Date {
  return new Date(date.toISOString().slice(0, 10));
}

export async function upsertContentAnalyticsSnapshot(
  contentItemId: string,
  snapshotDate: Date,
  result: AnalyticsResult,
  rawResponseSanitized?: unknown
) {
  const day = dayOnly(snapshotDate);
  return prisma.socialContentAnalyticsSnapshot.upsert({
    where: { social_content_analytics_item_date: { contentItemId, snapshotDate: day } },
    create: {
      contentItemId,
      snapshotDate: day,
      views: result.views,
      likes: result.likes,
      comments: result.comments,
      shares: result.shares,
      watchTimeSeconds: result.watchTimeSeconds,
      retentionPct: result.retentionPct,
      clicks: result.clicks,
      notAvailableMetrics: result.notAvailableMetrics,
      rawResponseSanitized: rawResponseSanitized ? (sanitizeForStorage(rawResponseSanitized) as object) : undefined,
    },
    update: {
      views: result.views,
      likes: result.likes,
      comments: result.comments,
      shares: result.shares,
      watchTimeSeconds: result.watchTimeSeconds,
      retentionPct: result.retentionPct,
      clicks: result.clicks,
      notAvailableMetrics: result.notAvailableMetrics,
      rawResponseSanitized: rawResponseSanitized ? (sanitizeForStorage(rawResponseSanitized) as object) : undefined,
      fetchedAt: new Date(),
    },
  });
}

export async function upsertAccountAnalyticsSnapshot(
  socialAccountId: string,
  snapshotDate: Date,
  followers: number | null,
  notAvailableMetrics: string[]
) {
  const day = dayOnly(snapshotDate);
  return prisma.socialAccountAnalyticsSnapshot.upsert({
    where: { social_account_analytics_account_date: { socialAccountId, snapshotDate: day } },
    create: { socialAccountId, snapshotDate: day, followers, notAvailableMetrics },
    update: { followers, notAvailableMetrics, fetchedAt: new Date() },
  });
}

export async function listContentAnalytics(contentItemId: string) {
  return prisma.socialContentAnalyticsSnapshot.findMany({
    where: { contentItemId },
    orderBy: { snapshotDate: "desc" },
  });
}

export async function listAccountAnalytics(socialAccountId: string, from?: Date, to?: Date) {
  return prisma.socialAccountAnalyticsSnapshot.findMany({
    where: { socialAccountId, snapshotDate: { gte: from, lte: to } },
    orderBy: { snapshotDate: "desc" },
  });
}
