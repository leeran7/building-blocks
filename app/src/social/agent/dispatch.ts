/**
 * The single authz-checked tool executor (AC-21). Every tool call —
 * whether from an interactive chat turn or a scheduled job — MUST flow
 * through `dispatchTool()`. There is no other code path that turns a tool
 * name + arguments into a DB/provider side effect, and there is no tool
 * here that accepts a raw SQL string, a raw Prisma query object, or an
 * unrestricted "run any function" capability (AC-20).
 *
 * `ctx.uid` must already have passed `requireSocialAdmin()` at the route
 * boundary — this function does not re-verify a Firebase token itself, but
 * refuses to run without a uid, so a tool call can never be reached by an
 * unauthenticated path even if a future caller forgets the route guard.
 */

import { z } from "zod";
import { TOOL_SCHEMAS, isKnownTool } from "./toolRegistry";
import { getSocialAccountsTool } from "./tools/accountTools";
import { getBrandProfileTool } from "./tools/brandProfileTools";
import { getContentCalendarTool } from "./tools/calendarTools";
import {
  createContentIdeaTool,
  generateScriptTool,
  generateCaptionTool,
  generateTitleTool,
  generateDescriptionTool,
  createContentVariationsTool,
} from "./tools/generationTools";
import { repurposeContentTool } from "./tools/repurposeTools";
import {
  createPostTool,
  createThreadTool,
  prepareVideoUploadTool,
  scheduleContentTool,
  publishContentTool,
} from "./tools/publishingTools";
import { getSocialAnalyticsTool, analyzeContentPerformanceTool } from "./tools/analyticsTools";
import { generateWeeklyStrategyTool } from "./tools/strategyTools";
import type { SocialAgentTaskStatus, SocialAgentToolName } from "../types";

export interface ToolContext {
  uid: string;
}

export interface DispatchResult {
  status: SocialAgentTaskStatus;
  output: unknown;
  errorMessage?: string;
}

type Handler = (input: unknown, ctx: ToolContext) => Promise<unknown>;

const HANDLERS: Record<SocialAgentToolName, Handler> = {
  get_social_accounts: () => getSocialAccountsTool(),
  get_brand_profile: () => getBrandProfileTool(),
  get_content_calendar: (input, _ctx) => getContentCalendarTool(input as never),
  create_content_idea: (input, ctx) => createContentIdeaTool(input as never, ctx),
  generate_script: (input, ctx) => generateScriptTool(input as never, ctx),
  generate_caption: (input, ctx) => generateCaptionTool(input as never, ctx),
  generate_title: (input, ctx) => generateTitleTool(input as never, ctx),
  generate_description: (input, ctx) => generateDescriptionTool(input as never, ctx),
  create_content_variations: (input, ctx) => createContentVariationsTool(input as never, ctx),
  repurpose_content: (input, ctx) => repurposeContentTool(input as never, ctx),
  create_post: (input, ctx) => createPostTool(input as never, ctx),
  create_thread: (input, ctx) => createThreadTool(input as never, ctx),
  prepare_video_upload: (input, _ctx) => prepareVideoUploadTool(input as never),
  schedule_content: (input, ctx) => scheduleContentTool(input as never, ctx),
  publish_content: (input, ctx) => publishContentTool(input as never, ctx),
  get_social_analytics: (input, _ctx) => getSocialAnalyticsTool(input as never),
  analyze_content_performance: (input, _ctx) => analyzeContentPerformanceTool(input as never),
  generate_weekly_strategy: (input, ctx) => generateWeeklyStrategyTool(input as never, ctx),
};

function isToolResultShaped(value: unknown): value is { ok: boolean; data?: unknown; reason?: string; detail?: string } {
  return typeof value === "object" && value !== null && "ok" in value;
}

function normalize(raw: unknown): { status: SocialAgentTaskStatus; output: unknown; errorMessage?: string } {
  if (isToolResultShaped(raw)) {
    if (raw.ok) return { status: "SUCCEEDED", output: raw.data };
    const status: SocialAgentTaskStatus = raw.reason === "UNSUPPORTED_BY_PLATFORM" ? "UNSUPPORTED" : "FAILED";
    // AC-22: the structured reason/detail is exactly what reaches the transcript — never
    // dropped or replaced with a fabricated success value.
    return { status, output: { reason: raw.reason, detail: raw.detail }, errorMessage: raw.detail };
  }
  return { status: "SUCCEEDED", output: raw };
}

export async function dispatchTool(
  toolName: string,
  rawInput: unknown,
  ctx: ToolContext
): Promise<DispatchResult> {
  if (!ctx.uid) {
    return { status: "FAILED", output: null, errorMessage: "Tool execution requires an authenticated admin identity" };
  }
  if (!isKnownTool(toolName)) {
    return { status: "FAILED", output: null, errorMessage: `Unknown tool: ${toolName}` };
  }

  const schema = TOOL_SCHEMAS[toolName];
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      status: "FAILED",
      output: null,
      errorMessage: `Invalid arguments for ${toolName}: ${(parsed.error as z.ZodError).message}`,
    };
  }

  try {
    const result = await HANDLERS[toolName](parsed.data, ctx);
    return normalize(result);
  } catch (err) {
    return { status: "FAILED", output: null, errorMessage: (err as Error).message };
  }
}
