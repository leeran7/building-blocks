/**
 * Content repurposing service (Epic E, AC-18/19). One source item -> N
 * platform-adapted new DRAFT items with traceable `sourceItemId` lineage.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "../agent/llmClient";
import { getBrandProfile } from "../../db/social/brandProfile";
import { getContentItemById, createContentItem } from "../../db/social/contentItems";
import { checkAvoidTerms, validateCaptionLength } from "./safety";
import { getBoundedMemorySummary } from "./memory";
import { prisma } from "../../db/client";
import type { SocialContentType } from "../types";
import type { SocialContentItem } from "@prisma/client";

const repurposeDraftSchema = z.object({
  contentType: z.enum(["TIKTOK_VIDEO", "YOUTUBE_SHORT", "YOUTUBE_LONGFORM", "X_POST", "X_THREAD"]),
  title: z.string().optional(),
  hook: z.string().optional(),
  script: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  hashtags: z.array(z.string()).default([]),
  cta: z.string().optional(),
  visualDirection: z.string().optional(),
  threadParts: z.array(z.string()).optional(),
});

const repurposeSchema = z.object({ drafts: z.array(repurposeDraftSchema) });

const CONTENT_TYPE_TO_PLATFORM = {
  TIKTOK_VIDEO: "TIKTOK",
  YOUTUBE_SHORT: "YOUTUBE",
  YOUTUBE_LONGFORM: "YOUTUBE",
  X_POST: "X",
  X_THREAD: "X",
} as const;

export class RepurposeError extends Error {}

export async function repurposeContent(
  sourceItemId: string,
  targets: SocialContentType[],
  createdByUid: string
): Promise<SocialContentItem[]> {
  const source = await getContentItemById(sourceItemId);
  if (!source) throw new RepurposeError("Source content item not found");
  if (targets.length === 0) throw new RepurposeError("At least one repurpose target is required");

  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);
  const avoidTerms = brand?.topicsToAvoid ?? [];

  const sourceText = [source.hook, source.script, source.caption, source.description, source.title]
    .filter(Boolean)
    .join("\n");

  let object: z.infer<typeof repurposeSchema>;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: repurposeSchema,
      system: [
        "You repurpose one piece of source content into DISTINCT versions for other platforms/formats.",
        "Never copy the source text verbatim — adapt structure, length, and hook to each target format.",
        memory,
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: `Source content (platform: ${source.platform}):\n${sourceText}\n\nRepurpose this into these target formats: ${targets.join(", ")}.`,
    });
    object = result.object;
  } catch (err) {
    throw new RepurposeError(`Repurposing failed: ${(err as Error).message}`);
  }

  const draftsByType = new Map(object.drafts.map((d) => [d.contentType, d]));
  const missing = targets.filter((t) => !draftsByType.has(t));
  if (missing.length > 0) {
    throw new RepurposeError(`Model did not return a draft for: ${missing.join(", ")} — no content was saved`);
  }

  return prisma.$transaction(async (tx) => {
    const created: SocialContentItem[] = [];
    for (const target of targets) {
      const draft = draftsByType.get(target)!;
      const platform = CONTENT_TYPE_TO_PLATFORM[target];
      const textToCheck = [draft.hook, draft.script, draft.caption, draft.description, draft.title]
        .filter(Boolean)
        .join(" ");
      const avoidCheck = checkAvoidTerms(textToCheck, avoidTerms);
      const captionCheck = validateCaptionLength(platform, draft.caption ?? draft.description);
      const validationErrors: Record<string, unknown> = {};
      if (!captionCheck.valid) {
        validationErrors.captionLength = `Caption is ${captionCheck.length} chars, limit is ${captionCheck.limit}`;
      }

      const item = await createContentItem(
        {
          platform,
          contentType: target,
          sourceItemId: source.id,
          title: draft.title,
          hook: draft.hook,
          script: draft.script,
          caption: draft.caption,
          description: draft.description,
          hashtags: draft.hashtags,
          cta: draft.cta,
          visualDirection: draft.visualDirection,
          threadParts: draft.threadParts,
          brandProfileVersion: brand?.version ?? null,
          generatedByModel: process.env.AI_MODEL || "gpt-4o-mini",
          sourceToolName: "repurpose_content",
          blockedByAvoidTerm: avoidCheck.blocked,
          blockedTerms: avoidCheck.matchedTerms,
          validationErrors: Object.keys(validationErrors).length ? validationErrors : null,
          createdByUid,
          status: "DRAFT",
        },
        tx
      );
      created.push(item);
    }
    return created;
  });
}
