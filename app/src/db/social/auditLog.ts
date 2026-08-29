/**
 * AuditLog data access (Epic N). This is the ONLY write path for
 * SocialAuditLog rows — every mutating service function calls `writeAuditLog`
 * so there is exactly one place that can create an entry (AC-50).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../client";
import { sanitizeForStorage } from "../../social/services/safety";
import type {
  SocialAuditAction,
  SocialAuditResult,
  SocialPlatform,
} from "../../social/types";

export interface WriteAuditLogInput {
  action: SocialAuditAction;
  result: SocialAuditResult;
  /** Firebase UID, or "system:<job-name>" / "system:auto-publish" / "system:cron". */
  initiator: string;
  platform?: SocialPlatform | null;
  socialAccountId?: string | null;
  contentItemId?: string | null;
  errorDetail?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  return prisma.socialAuditLog.create({
    data: {
      action: input.action,
      result: input.result,
      initiator: input.initiator,
      platform: input.platform ?? null,
      socialAccountId: input.socialAccountId ?? null,
      contentItemId: input.contentItemId ?? null,
      errorDetail: input.errorDetail ?? null,
      metadata: input.metadata
        ? (sanitizeForStorage(input.metadata) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

export interface AuditLogQuery {
  platform?: SocialPlatform;
  socialAccountId?: string;
  action?: SocialAuditAction;
  result?: SocialAuditResult;
  cursor?: string;
  limit?: number;
}

export async function queryAuditLog(query: AuditLogQuery) {
  const limit = Math.min(query.limit ?? 50, 200);
  const entries = await prisma.socialAuditLog.findMany({
    where: {
      platform: query.platform,
      socialAccountId: query.socialAccountId,
      action: query.action,
      result: query.result,
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;
  return {
    entries: page,
    nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
  };
}
