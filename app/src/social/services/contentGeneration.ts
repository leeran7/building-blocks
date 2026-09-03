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
import {
  createContentItem,
  getContentItemById,
  updateContentItem,
  incrementRegenerateVersion,
} from "../../db/social/contentItems";
import { writeAuditLog } from "../../db/social/auditLog";
import { checkAvoidTerms, validateCaptionLength } from "./safety";
import { errResult, okResult, type ToolResult } from "../types";
import { getBoundedMemorySummary } from "./memory";
import { startVideosForContentItems } from "./videoGeneration";
import { analyzeClimbReplay, topHighlightsVideoPrompt } from "./replayAnalysis";
import { prisma } from "../../db/client";
import type { SocialPlatform, SocialContentType } from "../types";
import { PLATFORM_CONTENT_TYPES } from "../types";
import type { SocialContentItem, Prisma } from "@prisma/client";

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
  generateVideo?: boolean;
  replayUrl?: string;
  /** Pre-computed replay analysis (from analyze_climb_replay tool). */
  replayAnalysis?: Awaited<ReturnType<typeof import("./replayAnalysis").analyzeClimbReplay>>;
}

export interface GenerateContentResult {
  promptBatchId: string;
  items: SocialContentItem[];
  videoJobs?: Array<{ contentItemId: string; assetId?: string; error?: string }>;
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

  let replayContext = input.replayAnalysis ?? null;
  if (!replayContext && input.replayUrl?.trim()) {
    try {
      replayContext = await analyzeClimbReplay(input.replayUrl);
    } catch (err) {
      throw new ContentGenerationError(`Replay analysis failed: ${(err as Error).message}`);
    }
  }

  const marketingPrompt = replayContext
    ? [
        input.prompt,
        "",
        "── Climb replay context (use these real moments in hooks and visualDirection) ──",
        replayContext.summary,
        ...replayContext.highlights.slice(0, 4).map(
          (h) => `• ${h.title} (${h.raceSeconds.toFixed(0)}s, ${h.peakYM.toFixed(0)}m): ${h.description}`
        ),
      ].join("\n")
    : input.prompt;

  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);

  let object: z.infer<typeof generationSchema>;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: generationSchema,
      system: buildSystemPrompt(brand, memory),
      prompt: `Create platform-adapted content drafts for these platforms: ${input.platforms.join(", ")}.\n\nContent idea:\n${marketingPrompt}`,
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
          visualDirection:
            draft.visualDirection ??
            (replayContext && (platform === "TIKTOK" || contentType === "YOUTUBE_SHORT")
              ? topHighlightsVideoPrompt(replayContext.highlights)
              : undefined),
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

  let videoJobs: GenerateContentResult["videoJobs"];
  if (input.generateVideo) {
    const videoItemIds = items
      .filter(
        (item) =>
          item.platform === "TIKTOK" ||
          (item.platform === "YOUTUBE" && item.contentType === "YOUTUBE_SHORT")
      )
      .map((item) => item.id);
    if (videoItemIds.length > 0) {
      videoJobs = await startVideosForContentItems(videoItemIds);
    }
  }

  return { promptBatchId, items, videoJobs };
}

const REGENERATABLE_FIELDS = ["script", "caption", "title", "description"] as const;
export type RegeneratableField = (typeof REGENERATABLE_FIELDS)[number];

const fieldValueSchema = z.object({ value: z.string() });

/**
 * AC-33: regenerates ONE field of an existing draft with AI, in place —
 * same row/id, `version` incremented, never a new ContentItem. Backs the
 * generate_script/generate_caption/generate_title/generate_description
 * tools (each is this function pinned to one field).
 */
export async function regenerateContentField(
  itemId: string,
  field: RegeneratableField,
  instructions: string | undefined,
  uid: string
): Promise<ToolResult<SocialContentItem>> {
  const item = await getContentItemById(itemId);
  if (!item) return errResult("NOT_FOUND", "Content item not found");
  if (item.status === "PUBLISHED" || item.status === "SCHEDULED") {
    return errResult("VALIDATION_ERROR", `Cannot regenerate content on an item in status ${item.status}`);
  }

  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);
  const context = [
    `Platform: ${item.platform}. Content type: ${item.contentType}.`,
    item.title ? `Current title: ${item.title}` : "",
    item.hook ? `Current hook: ${item.hook}` : "",
    item.script ? `Current script: ${item.script}` : "",
    item.caption ? `Current caption: ${item.caption}` : "",
    item.description ? `Current description: ${item.description}` : "",
    instructions ? `Regeneration instructions: ${instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let value: string;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: fieldValueSchema,
      system: [
        `You rewrite the "${field}" field of a social media draft. Return only the new ${field} text.`,
        brand ? `Brand: ${brand.name}. Tone: ${brand.tone ?? "n/a"}.` : "",
        brand?.topicsToAvoid.length ? `NEVER mention: ${brand.topicsToAvoid.join(", ")}.` : "",
        memory,
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: `${context}\n\nRewrite the ${field}.`,
    });
    value = result.object.value;
  } catch (err) {
    throw new ContentGenerationError(`Regenerating ${field} failed: ${(err as Error).message}`);
  }

  const avoidTerms = brand?.topicsToAvoid ?? [];
  const avoidCheck = checkAvoidTerms(value, avoidTerms);
  const captionCheck = field === "caption" ? validateCaptionLength(item.platform, value) : null;

  const fieldUpdate: Partial<Record<RegeneratableField, string>> = { [field]: value };
  const updated = await updateContentItem(itemId, {
    ...fieldUpdate,
    blockedByAvoidTerm: avoidCheck.blocked,
    blockedTerms: avoidCheck.matchedTerms,
    validationErrors: (captionCheck && !captionCheck.valid
      ? { captionLength: `${captionCheck.length}/${captionCheck.limit}` }
      : null) as unknown as Prisma.InputJsonValue | undefined,
  });
  await incrementRegenerateVersion(itemId);
  await writeAuditLog({
    action: "REGENERATE_CONTENT",
    result: "SUCCESS",
    initiator: uid,
    platform: updated.platform,
    contentItemId: updated.id,
    metadata: { field },
  });

  return okResult(updated);
}

const variationSchema = z.object({
  title: z.string().optional(),
  hook: z.string().optional(),
  script: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  hashtags: z.array(z.string()).default([]),
});
const variationsSchema = z.object({ variations: z.array(variationSchema) });

/** AC-33-adjacent: N alternative DRAFT siblings of an existing item, same platform/contentType, linked via sourceItemId. */
export async function createContentVariations(
  sourceItemId: string,
  count: number,
  createdByUid: string
): Promise<ToolResult<SocialContentItem[]>> {
  const source = await getContentItemById(sourceItemId);
  if (!source) return errResult("NOT_FOUND", "Source content item not found");
  if (count < 1 || count > 5) return errResult("VALIDATION_ERROR", "count must be between 1 and 5");

  const [brand, memory] = await Promise.all([getBrandProfile(), getBoundedMemorySummary()]);
  const sourceText = [source.hook, source.script, source.caption, source.description, source.title]
    .filter(Boolean)
    .join("\n");

  let object: z.infer<typeof variationsSchema>;
  try {
    const result = await generateObject({
      model: getLanguageModel(),
      schema: variationsSchema,
      system: [
        `Produce ${count} DISTINCT alternative versions of this ${source.platform} ${source.contentType} draft — different hooks/angles, same core idea.`,
        memory,
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: sourceText || source.prompt || "No source text available — invent plausible alternatives.",
    });
    object = result.object;
  } catch (err) {
    throw new ContentGenerationError(`Variation generation failed: ${(err as Error).message}`);
  }

  const avoidTerms = brand?.topicsToAvoid ?? [];
  const created = await prisma.$transaction(async (tx) => {
    const items: SocialContentItem[] = [];
    for (const variant of object.variations.slice(0, count)) {
      const textToCheck = [variant.title, variant.hook, variant.script, variant.caption, variant.description]
        .filter(Boolean)
        .join(" ");
      const avoidCheck = checkAvoidTerms(textToCheck, avoidTerms);
      const item = await createContentItem(
        {
          platform: source.platform,
          contentType: source.contentType,
          sourceItemId: source.id,
          title: variant.title,
          hook: variant.hook,
          script: variant.script,
          caption: variant.caption,
          description: variant.description,
          hashtags: variant.hashtags,
          brandProfileVersion: brand?.version ?? null,
          generatedByModel: process.env.AI_MODEL || "gpt-4o-mini",
          sourceToolName: "create_content_variations",
          blockedByAvoidTerm: avoidCheck.blocked,
          blockedTerms: avoidCheck.matchedTerms,
          createdByUid,
          status: "DRAFT",
        },
        tx
      );
      items.push(item);
    }
    return items;
  });

  return okResult(created);
}

export interface CreateDraftInput {
  platform: SocialPlatform;
  contentType: SocialContentType;
  title?: string;
  hook?: string;
  script?: string;
  caption?: string;
  description?: string;
  hashtags?: string[];
  cta?: string;
  threadParts?: string[];
  createdByUid: string;
  sourceToolName: "create_post" | "create_thread";
}

/**
 * Deterministic (no LLM call) draft creation — backs create_post/create_thread,
 * used when the agent has already composed the copy earlier in the
 * conversation and just needs it persisted as a reviewable DRAFT row.
 */
export async function createDraftContentItem(input: CreateDraftInput): Promise<ToolResult<SocialContentItem>> {
  const text = [input.title, input.hook, input.script, input.caption, input.description]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return errResult("VALIDATION_ERROR", "At least one content field must be provided");

  const brand = await getBrandProfile();
  const avoidTerms = brand?.topicsToAvoid ?? [];
  const avoidCheck = checkAvoidTerms(text, avoidTerms);
  const captionCheck = validateCaptionLength(input.platform, input.caption ?? input.description);

  const item = await createContentItem({
    platform: input.platform,
    contentType: input.contentType,
    title: input.title,
    hook: input.hook,
    script: input.script,
    caption: input.caption,
    description: input.description,
    hashtags: input.hashtags ?? [],
    cta: input.cta,
    threadParts: input.threadParts,
    brandProfileVersion: brand?.version ?? null,
    sourceToolName: input.sourceToolName,
    blockedByAvoidTerm: avoidCheck.blocked,
    blockedTerms: avoidCheck.matchedTerms,
    validationErrors: !captionCheck.valid ? { captionLength: `${captionCheck.length}/${captionCheck.limit}` } : null,
    createdByUid: input.createdByUid,
    status: "DRAFT",
  });

  return okResult(item);
}
