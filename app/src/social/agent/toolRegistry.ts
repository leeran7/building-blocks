/**
 * The closed 18-tool set (AC-20). This file is the SINGLE source of truth
 * for tool names, descriptions, and input schemas — the LLM only ever sees
 * these definitions (no `execute` is attached here, see dispatch.ts), and
 * `AGENT_TOOL_NAMES` in ../types.ts is validated against this file's keys
 * by a test to guarantee the two never drift apart.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolSet } from "ai";
import { AGENT_TOOL_NAMES } from "../types";
import type { SocialAgentToolName } from "../types";

const platformEnum = z.enum(["TIKTOK", "X", "YOUTUBE"]);
const contentTypeEnum = z.enum(["TIKTOK_VIDEO", "YOUTUBE_SHORT", "YOUTUBE_LONGFORM", "X_POST", "X_THREAD"]);
const statusEnum = z.enum([
  "IDEA",
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "REJECTED",
  "FAILED",
]);
const assetKindEnum = z.enum(["VIDEO", "IMAGE"]);

export const TOOL_SCHEMAS = {
  get_social_accounts: z.object({}),
  get_brand_profile: z.object({}),
  get_content_calendar: z.object({
    status: statusEnum.optional().describe("Filter by lifecycle status"),
    platform: platformEnum.optional(),
    fromIso: z.string().optional().describe("ISO date, inclusive lower bound on scheduledAt"),
    toIso: z.string().optional().describe("ISO date, inclusive upper bound on scheduledAt"),
  }),
  create_content_idea: z.object({
    prompt: z.string().min(1).describe("Natural-language content idea"),
    platforms: z.array(platformEnum).min(1),
    generateVideo: z
      .boolean()
      .optional()
      .default(true)
      .describe("When true, also generate an AI video (OpenAI Sora) for TikTok and YouTube Short drafts"),
    replayUrl: z
      .string()
      .optional()
      .describe("Optional /play?r=… link or raw replay token — merges climb highlights into the brief"),
  }),
  analyze_climb_replay: z.object({
    replayUrl: z.string().min(1).describe("Doomstack replay URL (/play?r=…) or raw replay token"),
  }),
  generate_script: z.object({
    contentItemId: z.string(),
    instructions: z.string().optional(),
  }),
  generate_caption: z.object({
    contentItemId: z.string(),
    instructions: z.string().optional(),
  }),
  generate_title: z.object({
    contentItemId: z.string(),
    instructions: z.string().optional(),
  }),
  generate_description: z.object({
    contentItemId: z.string(),
    instructions: z.string().optional(),
  }),
  create_content_variations: z.object({
    contentItemId: z.string(),
    count: z.number().int().min(1).max(5).default(3),
  }),
  repurpose_content: z.object({
    contentItemId: z.string(),
    targets: z.array(contentTypeEnum).min(1),
  }),
  create_post: z.object({
    platform: platformEnum,
    contentType: contentTypeEnum,
    title: z.string().optional(),
    hook: z.string().optional(),
    script: z.string().optional(),
    caption: z.string().optional(),
    description: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    cta: z.string().optional(),
  }),
  create_thread: z.object({
    threadParts: z.array(z.string()).min(1),
    title: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
  }),
  prepare_video_upload: z.object({
    contentItemId: z.string(),
    kind: assetKindEnum,
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().positive(),
  }),
  schedule_content: z.object({
    contentItemId: z.string(),
    scheduledAtIso: z.string().describe("ISO datetime for the scheduled publish time"),
    socialAccountId: z.string(),
  }),
  publish_content: z.object({
    contentItemId: z.string(),
  }),
  get_social_analytics: z.object({
    platform: platformEnum.optional(),
    fromIso: z.string().optional(),
    toIso: z.string().optional(),
  }),
  analyze_content_performance: z.object({
    platform: platformEnum.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  generate_weekly_strategy: z.object({
    isoWeek: z.string().optional().describe('e.g. "2026-W35" — defaults to the current ISO week'),
  }),
} as const satisfies Record<SocialAgentToolName, z.ZodObject<z.ZodRawShape>>;

const TOOL_DESCRIPTIONS: Record<SocialAgentToolName, string> = {
  get_social_accounts: "List connected TikTok/X/YouTube accounts and their connection status.",
  get_brand_profile: "Get the current brand profile (name, niche, audience, tone, topics to discuss/avoid, CTAs).",
  get_content_calendar: "List content items (drafts/scheduled/published/etc.), optionally filtered by status/platform/date range.",
  create_content_idea: "Generate distinct, platform-adapted content drafts for one or more platforms from a natural-language idea. Set generateVideo=true to also create an AI video for TikTok/YouTube Short items. Pass replayUrl to weave in real climb highlights.",
  analyze_climb_replay: "Decode a Doomstack climb replay, re-simulate it, and return the most intense moments (near-death, clutches, milestones) for marketing copy.",
  generate_script: "Regenerate the script field of an existing draft content item.",
  generate_caption: "Regenerate the caption field of an existing draft content item.",
  generate_title: "Regenerate the title field of an existing draft content item.",
  generate_description: "Regenerate the description field of an existing draft content item.",
  create_content_variations: "Generate several alternative versions of an existing draft (same platform/format).",
  repurpose_content: "Repurpose one existing content item into new drafts for other platforms/formats, with lineage tracking.",
  create_post: "Create a new draft content item (any platform/content type) from already-composed copy.",
  create_thread: "Create a new X (Twitter) thread draft from already-composed thread parts.",
  prepare_video_upload: "Start a chunked/resumable upload session for a video or image asset attached to a content item.",
  schedule_content: "Schedule an APPROVED content item to publish at a future time on a connected account.",
  publish_content: "Publish a SCHEDULED content item now (subject to approval-mode and idempotency rules).",
  get_social_analytics: "Fetch stored analytics snapshots for accounts and published content items.",
  analyze_content_performance: "Rank recently published content by engagement to surface top/bottom performers.",
  generate_weekly_strategy: "Analyze last week's performance and propose a content calendar/drafts for the coming week.",
};

/**
 * Builds the tool set handed to the LLM. Deliberately has NO `execute`
 * function — the AI SDK will return unexecuted tool-calls, which
 * chatRunner.ts hands to dispatch.ts for authz-checked, audited execution.
 * This keeps "who is allowed to actually run a tool" entirely outside the
 * SDK's control (AC-21).
 */
export function buildToolSet(): ToolSet {
  const entries = AGENT_TOOL_NAMES.map((name) => [
    name,
    tool({ description: TOOL_DESCRIPTIONS[name], inputSchema: TOOL_SCHEMAS[name] as z.ZodObject<z.ZodRawShape> }),
  ]);
  return Object.fromEntries(entries) as ToolSet;
}

export function isKnownTool(name: string): name is SocialAgentToolName {
  return (AGENT_TOOL_NAMES as string[]).includes(name);
}
