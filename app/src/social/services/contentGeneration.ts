/**
 * Content Studio generation service (Epic D, AC-14..17). One LLM call
 * produces distinct, platform-adapted drafts for every requested platform —
 * never the same text copy-pasted across platforms. All-or-nothing: nothing
 * is persisted until the full batch succeeds (AC-16), and every draft is
 * validated (avoid-terms, caption length) before being handed back.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { randomBytes } from "crypto";
import { getLanguageModel } from "../agent/llmClient";
import { getBrandProfile } from "../../db/social/brandProfile";
import { createContentItem } from "../../db/social/contentItems";
import { checkAvoidTerms, validateCaptionLength } from "./safety";
import { getBoundedMemorySummary } from "./memory";
import { prisma } from "../../db/client";
import type { SocialPlatform } from "../types";
import { PLATFORM_CONTENT_TYPES } from "../types";
import type { SocialContentItem } from "@prisma/client";

const platformDraftSchema = z.object({
  platform: z.enum(["TIKTOK", "X", "YOUTUBE"]),
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

const generationSchema = z.object({
  drafts: z.array(platformDraftSchema),
});

export type PlatformDraft = z.infer<typeof platformDraftSchema>;

export interface GenerateContentInput {
  prompt: string;
  platforms: SocialPlatform[];
  createdByUid: string;
}

export interface GenerateContentResult {
  promptBatchId: string;
  items: SocialContentItem[];
}

export class ContentGenerationError extends Error {}

function buildSystemPrompt(brand: Awaited<ReturnType<typeof getBrandProfile>>, memory: string): string {
  const lines = [
    "You are a social media content strategist writing DISTINCT, platform-native drafts.",
    "Never reuse the same wording verbatim across platforms — adapt hook, pacing, length, and tone to each platform's audience and format.",
    "TikTok: punchy hook in the first line, short spoken script, casual caption, relevant hashtags.",
    "X: either a single concise post (<= 280 chars) OR a thread (array of short, punchy parts) — pick whichever suits the idea better.",
    "YouTube: a compelling title, a keyword-rich description, and either a Short script (vertical, <60s) or a long-form outline depending on the idea.",
  ];
  if (brand) {
    lines.push(
      `Brand: ${brand.name}.`,
      brand.niche ? `Niche: ${brand.niche}.` : "",
      brand.audience ? `Audience: ${brand.audience}.` : "",
      brand.tone ? `Tone: ${brand.tone}.` : "",
      brand.style ? `Style: ${brand.style}.` : "",
      brand.topicsToDiscuss.length ? `Preferred topics: ${brand.topicsToDiscuss.join(", ")}.` : "",
      brand.topicsToAvoid.length ? `NEVER mention or reference: ${brand.topicsToAvoid.join(", ")}.` : "",
      brand.ctas.length ? `Preferred CTAs: ${brand.ctas.join(", ")}.` : "",
      brand.terminology.length ? `Preferred terminology: ${brand.terminology.join(", ")}.` : ""
    );
  }
  if (memory) lines.push(memory);
  return lines.filter(Boolean).join("\n");
}

/** Maps a generic platform draft onto that platform's primary SocialContentType. */
function inferContentType(platform: SocialPlatform, draft: PlatformDraft) {
  const options = PLATFORM_CONTENT_TYPES[platform];
  if (platform === "X" && draft.threadParts && draft.threadParts.length > 1) return "X_THREAD" as const;
  if (platform === "X") return "X_POST" as const;
  if (platform === "YOUTUBE") return draft.script && draft.script.length < 600 ? "YOUTUBE_SHORT" as const : "YOUTUBE_LONGFORM" as const;
  return options[0];
}

export async function generateContentForPlatforms(
  input: GenerateContentInput
): Promise<GenerateContentResult> {
  if (!input.prompt.trim()) {
    throw new ContentGenerationError("Prompt must not be empty");
  }
  if (input.platforms.length === 0) {
    throw new ContentGenerationError("At least one platform must be selected");
  }

  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);

  let object: z.infer<typeof generationSchema>;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: generationSchema,
      system: buildSystemPrompt(brand, memory),
      prompt: `Create platform-adapted content drafts for these platforms: ${input.platforms.join(", ")}.\n\nContent idea: ${input.prompt}`,
    });
    object = result.object;
  } catch (err) {
    // AC-16: generation failure must never leave a partial/empty ContentItem.
    throw new ContentGenerationError(`Content generation failed: ${(err as Error).message}`);
  }

  const draftsByPlatform = new Map(object.drafts.map((d) => [d.platform, d]));
  const missing = input.platforms.filter((p) => !draftsByPlatform.has(p));
  if (missing.length > 0) {
    throw new ContentGenerationError(
      `Model did not return a draft for: ${missing.join(", ")} — no content was saved`
    );
  }

  const promptBatchId = randomBytes(12).toString("hex");
  const avoidTerms = brand?.topicsToAvoid ?? [];

  // All-or-nothing: the whole batch is created in a single transaction so a
  // mid-batch DB error never leaves an orphaned partial set (AC-16).
  const items = await prisma.$transaction(async (tx) => {
    const created: SocialContentItem[] = [];
    for (const platform of input.platforms) {
      const draft = draftsByPlatform.get(platform)!;
      const contentType = inferContentType(platform, draft);
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
          contentType,
          promptBatchId,
          prompt: input.prompt,
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
          sourceToolName: "create_content_idea",
          blockedByAvoidTerm: avoidCheck.blocked,
          blockedTerms: avoidCheck.matchedTerms,
          validationErrors: Object.keys(validationErrors).length ? validationErrors : null,
          createdByUid: input.createdByUid,
          status: "DRAFT",
        },
        tx
      );
      created.push(item);
    }
    return created;
  });

  return { promptBatchId, items };
}
