/**
 * Publication data access (Epic I) — durable attempt/result audit trail.
 * The `@@unique([contentItemId, attemptNumber])` constraint plus the raw
 * partial-unique index (`social_publication_one_success_per_item`, applied
 * in the migration) are the DB-level backstop for at-most-once publish
 * (ADR-3) — this module never needs to re-implement that guarantee, only
 * respect it (a second SUCCEEDED insert for the same item throws, which
 * callers must treat as "already published," not as an error to surface).
 */

import { prisma } from "../client";
import { sanitizeForStorage } from "../../social/services/safety";
import type { SocialPublication } from "@prisma/client";
import type { SocialPublicationStatus } from "../../social/types";

export async function nextAttemptNumber(contentItemId: string): Promise<number> {
  const last = await prisma.socialPublication.findFirst({
    where: { contentItemId },
    orderBy: { attemptNumber: "desc" },
  });
  return (last?.attemptNumber ?? 0) + 1;
}

export async function createPublicationAttempt(input: {
  contentItemId: string;
  socialAccountId?: string | null;
  attemptNumber: number;
}): Promise<SocialPublication> {
  return prisma.socialPublication.create({
    data: {
      contentItemId: input.contentItemId,
      socialAccountId: input.socialAccountId,
      attemptNumber: input.attemptNumber,
      status: "IN_PROGRESS",
    },
  });
}

export async function finishPublicationAttempt(
  id: string,
  input: {
    status: SocialPublicationStatus;
    externalPostId?: string | null;
    rateLimitedUntil?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    rawResponseSanitized?: unknown;
  }
): Promise<SocialPublication> {
  return prisma.socialPublication.update({
    where: { id },
    data: {
      status: input.status,
      externalPostId: input.externalPostId,
      rateLimitedUntil: input.rateLimitedUntil,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      rawResponseSanitized: input.rawResponseSanitized
        ? (sanitizeForStorage(input.rawResponseSanitized) as object)
        : undefined,
      finishedAt: new Date(),
    },
  });
}

export async function listPublicationsForItem(contentItemId: string): Promise<SocialPublication[]> {
  return prisma.socialPublication.findMany({
    where: { contentItemId },
    orderBy: { attemptNumber: "desc" },
  });
}

export async function hasSucceededPublication(contentItemId: string): Promise<boolean> {
  const found = await prisma.socialPublication.findFirst({
    where: { contentItemId, status: "SUCCEEDED" },
  });
  return !!found;
}
