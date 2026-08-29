/**
 * Weekly strategy service (Epic L, AC-45..47). Analyzes the ISO week just
 * completed and produces (a) one `AIRecommendation` report row and (b) a
 * proposed calendar of `IDEA`/`DRAFT` content items for the *coming* week.
 *
 * Idempotency (AC-47): `AIRecommendation.isoWeek` is `@unique`, so a second
 * invocation for the same week is detected up front and returns the
 * already-persisted result instead of generating (and billing for) a
 * duplicate report or duplicate draft set. This function never mutates
 * approval/schedule state — proposed items are always created as `IDEA`,
 * regardless of `SocialAutomationSettings.approvalMode` (AC-46).
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "../agent/llmClient";
import { getBrandProfile } from "../../db/social/brandProfile";
import {
  createContentItem,
  listContentItemsByGeneratedWeek,
  listPublishedItemsInRange,
} from "../../db/social/contentItems";
import { listContentAnalytics } from "../../db/social/analyticsSnapshots";
import { getWeeklyRecommendation } from "../../db/social/aiRecommendations";
import { getBoundedMemorySummary } from "./memory";
import { checkAvoidTerms, validateCaptionLength } from "./safety";
import { computeEngagementScore } from "./analyticsIngestion";
import { prisma } from "../../db/client";
import { isoWeekBounds, previousIsoWeek, nextIsoWeek } from "../isoWeek";
import { PLATFORM_CONTENT_TYPES } from "../types";
import type { SocialAIRecommendation, SocialContentItem } from "@prisma/client";
import type { SocialPlatform } from "../types";

interface RankedItem {
  item: SocialContentItem;
  engagementScore: number;
}

async function rankPublishedItems(items: SocialContentItem[]): Promise<RankedItem[]> {
  const ranked = await Promise.all(
    items.map(async (item) => {
      const snapshots = await listContentAnalytics(item.id); // most-recent first
      const latest = snapshots[0];
      return { item, engagementScore: latest ? computeEngagementScore(latest) : 0 };
    })
  );
  return ranked.sort((a, b) => b.engagementScore - a.engagementScore);
}

const strategySchema = z.object({
  bestTopic: z.string(),
  bestHook: z.string(),
  recommendations: z.array(z.string()).min(1),
  proposedIdeas: z
    .array(
      z.object({
        platform: z.enum(["TIKTOK", "X", "YOUTUBE"]),
        prompt: z.string(),
        title: z.string().optional(),
        hook: z.string().optional(),
      })
    )
    .min(1),
});

function buildAnalysisPrompt(
  rankedThisWeek: RankedItem[],
  totalScoreThisWeek: number,
  totalScorePrevWeek: number
): string {
  const lines = [
    "You are analyzing last week's published social content performance to plan next week's calendar.",
    rankedThisWeek.length > 0
      ? "Published items this week, ranked by engagement score (highest first):\n" +
        rankedThisWeek
          .slice(0, 15)
          .map(
            (r, i) =>
              `${i + 1}. [${r.item.platform}] "${r.item.title ?? r.item.hook ?? "untitled"}" — score ${r.engagementScore.toFixed(1)}`
          )
          .join("\n")
      : "No published items with analytics this week.",
    `Total engagement score this week: ${totalScoreThisWeek.toFixed(1)}. Previous week: ${totalScorePrevWeek.toFixed(1)}.`,
    "Based on this, identify the best-performing topic and hook style, give at least one concrete, actionable recommendation for next week, and propose 3-6 new content ideas (across TikTok/X/YouTube) for next week's calendar.",
  ];
  return lines.join("\n\n");
}

export interface WeeklyStrategyResult {
  isoWeek: string;
  recommendation: SocialAIRecommendation;
  proposedItems: SocialContentItem[];
  alreadyExisted: boolean;
}

export class WeeklyStrategyError extends Error {}

export async function generateWeeklyStrategy(isoWeek: string, initiator: string): Promise<WeeklyStrategyResult> {
  const existingRecommendation = await getWeeklyRecommendation(isoWeek);
  if (existingRecommendation) {
    const proposedItems = await listContentItemsByGeneratedWeek(nextIsoWeek(isoWeek));
    return { isoWeek, recommendation: existingRecommendation, proposedItems, alreadyExisted: true };
  }

  const { start, end } = isoWeekBounds(isoWeek);
  const prevWeek = previousIsoWeek(isoWeek);
  const prevBounds = isoWeekBounds(prevWeek);

  const [publishedThisWeek, publishedPrevWeek, brand, memory] = await Promise.all([
    listPublishedItemsInRange(start, end),
    listPublishedItemsInRange(prevBounds.start, prevBounds.end),
    getBrandProfile(),
    getBoundedMemorySummary(),
  ]);

  const [rankedThisWeek, rankedPrevWeek] = await Promise.all([
    rankPublishedItems(publishedThisWeek),
    rankPublishedItems(publishedPrevWeek),
  ]);

  const totalScoreThisWeek = rankedThisWeek.reduce((sum, r) => sum + r.engagementScore, 0);
  const totalScorePrevWeek = rankedPrevWeek.reduce((sum, r) => sum + r.engagementScore, 0);
  const weekOverWeekDeltaPct =
    totalScorePrevWeek > 0 ? ((totalScoreThisWeek - totalScorePrevWeek) / totalScorePrevWeek) * 100 : null;

  const topPost = rankedThisWeek[0]?.item ?? null;
  const bestPlatform: SocialPlatform | null = topPost?.platform ?? null;

  let strategy: z.infer<typeof strategySchema>;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: strategySchema,
      system: [
        "You are a social media strategist producing a weekly performance report and next week's content plan.",
        brand ? `Brand: ${brand.name}.${brand.niche ? ` Niche: ${brand.niche}.` : ""}` : "",
        brand?.topicsToAvoid.length ? `NEVER propose ideas involving: ${brand.topicsToAvoid.join(", ")}.` : "",
        memory,
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: buildAnalysisPrompt(rankedThisWeek, totalScoreThisWeek, totalScorePrevWeek),
    });
    strategy = result.object;
  } catch (err) {
    throw new WeeklyStrategyError(`Weekly strategy generation failed: ${(err as Error).message}`);
  }

  const targetWeek = nextIsoWeek(isoWeek);
  const avoidTerms = brand?.topicsToAvoid ?? [];

  // All-or-nothing per AC-16's same reasoning, plus this is the actual AC-47
  // idempotency boundary: the recommendation row and the proposed drafts are
  // committed together, so a crash between the two can never leave a
  // recommendation with no matching calendar (or vice versa) for a retry to
  // duplicate.
  const { recommendation, proposedItems } = await prisma.$transaction(async (tx) => {
    const rec = await tx.socialAIRecommendation.create({
      data: {
        isoWeek,
        bestPlatform,
        bestTopic: strategy.bestTopic,
        bestHook: strategy.bestHook,
        topPostContentItemId: topPost?.id ?? null,
        weekOverWeekDeltaPct,
        recommendations: strategy.recommendations,
        rawModelOutputSanitized: strategy as unknown as object,
      },
    });

    const created: SocialContentItem[] = [];
    for (const idea of strategy.proposedIdeas) {
      const contentType = PLATFORM_CONTENT_TYPES[idea.platform][0];
      const textToCheck = [idea.title, idea.hook, idea.prompt].filter(Boolean).join(" ");
      const avoidCheck = checkAvoidTerms(textToCheck, avoidTerms);
      if (avoidCheck.blocked) continue; // never propose a calendar item that violates brand rules

      const captionCheck = validateCaptionLength(idea.platform, idea.title);
      const item = await createContentItem(
        {
          platform: idea.platform,
          contentType,
          prompt: idea.prompt,
          title: idea.title,
          hook: idea.hook,
          generatedForIsoWeek: targetWeek,
          brandProfileVersion: brand?.version ?? null,
          generatedByModel: process.env.AI_MODEL || "gpt-4o-mini",
          sourceToolName: "generate_weekly_strategy",
          validationErrors: captionCheck.valid ? null : { captionLength: `${captionCheck.length}/${captionCheck.limit}` },
          status: "IDEA", // AC-46: never auto-scheduled/auto-published, regardless of approval mode
        },
        tx
      );
      created.push(item);
    }
    return { recommendation: rec, proposedItems: created };
  });

  return { isoWeek, recommendation, proposedItems, alreadyExisted: false };
}

export { getWeeklyRecommendation };
export { currentIsoWeek } from "../isoWeek";
