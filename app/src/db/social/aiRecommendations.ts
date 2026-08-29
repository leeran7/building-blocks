/**
 * AIRecommendation data access (Epic L). `isoWeek` unique constraint is
 * AC-47's idempotency key — a second write for the same week is rejected by
 * the DB, not just guarded in application code.
 */

import { prisma } from "../client";
import { sanitizeForStorage } from "../../social/services/safety";
import type { SocialPlatform } from "../../social/types";

export async function getWeeklyRecommendation(isoWeek: string) {
  return prisma.socialAIRecommendation.findUnique({
    where: { isoWeek },
    include: { topPostContentItem: { select: { id: true, title: true, platform: true } } },
  });
}

export async function createWeeklyRecommendation(input: {
  isoWeek: string;
  bestPlatform?: SocialPlatform | null;
  bestTopic?: string | null;
  bestHook?: string | null;
  topPostContentItemId?: string | null;
  weekOverWeekDeltaPct?: number | null;
  recommendations: string[];
  rawModelOutput?: unknown;
}) {
  return prisma.socialAIRecommendation.create({
    data: {
      isoWeek: input.isoWeek,
      bestPlatform: input.bestPlatform,
      bestTopic: input.bestTopic,
      bestHook: input.bestHook,
      topPostContentItemId: input.topPostContentItemId,
      weekOverWeekDeltaPct: input.weekOverWeekDeltaPct,
      recommendations: input.recommendations,
      rawModelOutputSanitized: input.rawModelOutput ? (sanitizeForStorage(input.rawModelOutput) as object) : undefined,
    },
  });
}
