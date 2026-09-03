/**
 * Shared types for the AI social media management feature.
 *
 * These mirror the Prisma enums 1:1 so application code never passes raw
 * strings across the service/provider boundary. See loop/architecture.md §3/§6.
 */

import type {
  SocialPlatform,
  SocialAccountStatus,
  SocialContentType,
  SocialContentStatus,
  SocialApprovalMode,
  SocialAssetKind,
  SocialAssetStatus,
  SocialPublicationStatus,
  SocialAgentRunKind,
  SocialAgentRunStatus,
  SocialAgentTaskStatus,
  SocialAgentToolName,
  SocialAuditAction,
  SocialAuditResult,
} from "@prisma/client";

export type {
  SocialPlatform,
  SocialAccountStatus,
  SocialContentType,
  SocialContentStatus,
  SocialApprovalMode,
  SocialAssetKind,
  SocialAssetStatus,
  SocialPublicationStatus,
  SocialAgentRunKind,
  SocialAgentRunStatus,
  SocialAgentTaskStatus,
  SocialAgentToolName,
  SocialAuditAction,
  SocialAuditResult,
};

/** The closed 18-tool set (AC-20) — single source of truth for validation. */
export const AGENT_TOOL_NAMES: SocialAgentToolName[] = [
  "get_social_accounts",
  "get_brand_profile",
  "get_content_calendar",
  "create_content_idea",
  "generate_script",
  "generate_caption",
  "generate_title",
  "generate_description",
  "create_content_variations",
  "repurpose_content",
  "create_post",
  "create_thread",
  "prepare_video_upload",
  "schedule_content",
  "publish_content",
  "get_social_analytics",
  "analyze_content_performance",
  "generate_weekly_strategy",
  "analyze_climb_replay",
];

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["TIKTOK", "X", "YOUTUBE"];

/** Per-platform static capability/limits used by validation + "unsupported" results. */
export const PLATFORM_CAPTION_LIMITS: Record<SocialPlatform, number> = {
  TIKTOK: 2200,
  X: 280,
  YOUTUBE: 5000,
};

export const PLATFORM_CONTENT_TYPES: Record<SocialPlatform, SocialContentType[]> = {
  TIKTOK: ["TIKTOK_VIDEO"],
  X: ["X_POST", "X_THREAD"],
  YOUTUBE: ["YOUTUBE_SHORT", "YOUTUBE_LONGFORM"],
};

/**
 * Structured result every provider/tool call returns instead of throwing for
 * expected/handleable conditions. `ok: false` with `reason` is how AC-22/AC-56
 * ("clearly report platform limitations instead of faking a workaround") is
 * satisfied structurally rather than by convention.
 */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "UNSUPPORTED_BY_PLATFORM"; detail: string }
  | { ok: false; reason: "RATE_LIMITED"; detail: string; retryAfterSeconds?: number }
  | { ok: false; reason: "REAUTH_REQUIRED"; detail: string }
  | { ok: false; reason: "PLATFORM_ERROR"; detail: string }
  | { ok: false; reason: "NOT_APPROVED"; detail: string }
  | { ok: false; reason: "NOT_FOUND"; detail: string }
  | { ok: false; reason: "VALIDATION_ERROR"; detail: string }
  | { ok: false; reason: "FORBIDDEN"; detail: string };

export function okResult<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function errResult<T = never>(
  reason: Exclude<ToolResult<T>, { ok: true }>["reason"],
  detail: string,
  extra?: Partial<{ retryAfterSeconds: number }>
): ToolResult<T> {
  return { ok: false, reason, detail, ...extra } as ToolResult<T>;
}
