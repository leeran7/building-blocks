/**
 * ContentItem data access — the core entity (Epics D-I). Includes the
 * conditional-UPDATE publish claim (ADR-3) that guarantees at-most-once
 * publish (AC-36), mirroring this repo's existing
 * `incrementViewsServed`/`updatePeakRank` raw-SQL idiom in src/db/blocks.ts.
 */

import { prisma } from "../client";
import type { SocialContentItem, Prisma } from "@prisma/client";
import type {
  SocialContentStatus,
  SocialContentType,
  SocialPlatform,
} from "../../social/types";

export interface CreateContentItemInput {
  platform: SocialPlatform;
  contentType: SocialContentType;
  promptBatchId?: string | null;
  sourceItemId?: string | null;
  prompt?: string | null;
  title?: string | null;
  hook?: string | null;
  script?: string | null;
  caption?: string | null;
  description?: string | null;
  hashtags?: string[];
  cta?: string | null;
  visualDirection?: string | null;
  threadParts?: string[] | null;
  brandProfileVersion?: number | null;
  generatedByModel?: string | null;
  sourceToolName?: string | null;
  blockedByAvoidTerm?: boolean;
  blockedTerms?: string[];
  validationErrors?: Record<string, unknown> | null;
  generatedForIsoWeek?: string | null;
  createdByUid?: string | null;
  status?: SocialContentStatus;
}

export async function createContentItem(
  input: CreateContentItemInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<SocialContentItem> {
  return tx.socialContentItem.create({
    data: {
      platform: input.platform,
      contentType: input.contentType,
      status: input.status ?? "DRAFT", // AC-23: never created APPROVED/SCHEDULED/PUBLISHED
      promptBatchId: input.promptBatchId,
      sourceItemId: input.sourceItemId,
      prompt: input.prompt,
      title: input.title,
      hook: input.hook,
      script: input.script,
      caption: input.caption,
      description: input.description,
      hashtags: input.hashtags ?? [],
      cta: input.cta,
      visualDirection: input.visualDirection,
      threadParts: input.threadParts ? (input.threadParts as unknown as object) : undefined,
      brandProfileVersion: input.brandProfileVersion,
      generatedByModel: input.generatedByModel,
      sourceToolName: input.sourceToolName as never,
      blockedByAvoidTerm: input.blockedByAvoidTerm ?? false,
      blockedTerms: input.blockedTerms ?? [],
      validationErrors: input.validationErrors as unknown as object | undefined,
      generatedForIsoWeek: input.generatedForIsoWeek,
      createdByUid: input.createdByUid,
    },
  });
}

export interface ContentItemQuery {
  status?: SocialContentStatus;
  statuses?: SocialContentStatus[];
  platform?: SocialPlatform;
  from?: Date;
  to?: Date;
  includeDeleted?: boolean;
  promptBatchId?: string;
}

export async function listContentItems(query: ContentItemQuery): Promise<SocialContentItem[]> {
  return prisma.socialContentItem.findMany({
    where: {
      deletedAt: query.includeDeleted ? undefined : null,
      status: query.status,
      ...(query.statuses ? { status: { in: query.statuses } } : {}),
      platform: query.platform,
      promptBatchId: query.promptBatchId,
      ...(query.from || query.to
        ? {
            scheduledAt: {
              gte: query.from,
              lte: query.to,
            },
          }
        : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function getContentItemById(id: string): Promise<SocialContentItem | null> {
  return prisma.socialContentItem.findFirst({ where: { id } });
}

export async function getContentItemWithRelations(id: string) {
  return prisma.socialContentItem.findFirst({
    where: { id },
    include: {
      sourceItem: { select: { id: true, title: true, platform: true } },
      publications: { orderBy: { attemptNumber: "desc" } },
      assets: true,
    },
  });
}

export async function updateContentItem(
  id: string,
  data: Prisma.SocialContentItemUpdateInput
): Promise<SocialContentItem> {
  return prisma.socialContentItem.update({ where: { id }, data });
}

export async function softDeleteContentItem(id: string): Promise<SocialContentItem> {
  return prisma.socialContentItem.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function approveContentItem(id: string, uid: string): Promise<SocialContentItem | null> {
  const result = await prisma.$executeRaw`
    UPDATE social_content_items
    SET status = 'APPROVED', "approvedByUid" = ${uid}, "approvedAt" = now(), "updatedAt" = now()
    WHERE id = ${id} AND status = 'READY_FOR_REVIEW' AND "deletedAt" IS NULL
  `;
  if (result === 0) return null;
  return getContentItemById(id);
}

export async function rejectContentItem(
  id: string,
  uid: string,
  reason?: string
): Promise<SocialContentItem | null> {
  const result = await prisma.$executeRaw`
    UPDATE social_content_items
    SET status = 'REJECTED', "rejectedByUid" = ${uid}, "rejectedAt" = now(), "rejectionReason" = ${reason ?? null}, "updatedAt" = now()
    WHERE id = ${id} AND status IN ('IDEA', 'DRAFT', 'READY_FOR_REVIEW') AND "deletedAt" IS NULL
  `;
  if (result === 0) return null;
  return getContentItemById(id);
}

/**
 * AC-35: only an APPROVED item may move to SCHEDULED. Conditional UPDATE so
 * a race against a concurrent reject/delete can't schedule a stale item.
 */
export async function scheduleContentItem(
  id: string,
  scheduledAt: Date,
  socialAccountId: string
): Promise<SocialContentItem | null> {
  const result = await prisma.$executeRaw`
    UPDATE social_content_items
    SET status = 'SCHEDULED', "scheduledAt" = ${scheduledAt}, "socialAccountId" = ${socialAccountId}, "updatedAt" = now()
    WHERE id = ${id} AND status = 'APPROVED' AND "deletedAt" IS NULL
  `;
  if (result === 0) return null;
  return getContentItemById(id);
}

/**
 * ADR-3: at-most-once publish claim. Only succeeds if the item is currently
 * SCHEDULED and not already locked by another in-flight attempt (or its lock
 * is stale — cleared after 2 minutes so a crashed invocation self-heals on
 * the next cron tick without permanently wedging the item).
 */
export async function claimContentItemForPublish(id: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE social_content_items
    SET "lockedAt" = now()
    WHERE id = ${id}
      AND status = 'SCHEDULED'
      AND "deletedAt" IS NULL
      AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '2 minutes')
  `;
  return result > 0;
}

export async function releaseContentItemLock(id: string): Promise<void> {
  await prisma.socialContentItem.update({ where: { id }, data: { lockedAt: null } });
}

export async function markContentItemPublished(
  id: string,
  externalPostId: string
): Promise<SocialContentItem> {
  return prisma.socialContentItem.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      externalPostId,
      lockedAt: null,
      failureReason: null,
    },
  });
}

export async function markContentItemFailed(id: string, reason: string): Promise<SocialContentItem> {
  return prisma.socialContentItem.update({
    where: { id },
    data: {
      status: "FAILED",
      failureReason: reason,
      lockedAt: null,
      publishAttempts: { increment: 1 },
    },
  });
}

/** Publish-sweep candidate query — bounded (LIMIT 50/tick, ADR-3 §10). */
export async function findDueScheduledItems(limit = 50): Promise<SocialContentItem[]> {
  return prisma.socialContentItem.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
      deletedAt: null,
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
}

export async function incrementRegenerateVersion(id: string): Promise<void> {
  await prisma.socialContentItem.update({ where: { id }, data: { version: { increment: 1 } } });
}
