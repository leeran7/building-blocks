/**
 * Front-end-only mapping from the raw AI Assistant tool set to the 4
 * plain-English categories a non-technical user actually cares about
 * (loop/design.md §6.1/§6.2). Nothing here changes what the LLM is allowed
 * to call — `src/social/agent/toolRegistry.ts` (the LLM-facing schema/
 * description source of truth) only has its `TOOL_DESCRIPTIONS` re-exported
 * below, not modified.
 */

import type { SocialAgentToolName } from "../../social/types";
import { TOOL_DESCRIPTIONS } from "../../social/agent/toolRegistry";

export { TOOL_DESCRIPTIONS };

export type ToolCategory = "RESEARCH" | "CREATE" | "PUBLISH" | "MEASURE";

export const CATEGORY_ORDER: ToolCategory[] = ["RESEARCH", "CREATE", "PUBLISH", "MEASURE"];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  RESEARCH: "Research",
  CREATE: "Create",
  PUBLISH: "Publish",
  MEASURE: "Measure",
};

/** Plain text glyphs — no new icon asset needed (loop/design.md §6.2). */
export const CATEGORY_ICONS: Record<ToolCategory, string> = {
  RESEARCH: "⌕",
  CREATE: "✎",
  PUBLISH: "↗",
  MEASURE: "▤",
};

export interface ToolCategoryInfo {
  category: ToolCategory;
  /** In-progress copy (PENDING/RUNNING), present tense, ends in an ellipsis. */
  verb: string;
  /** Completed copy (SUCCEEDED), past tense. */
  verbDone: string;
}

export const TOOL_CATEGORIES: Record<SocialAgentToolName, ToolCategoryInfo> = {
  get_social_accounts: { category: "RESEARCH", verb: "Checking your connected accounts…", verbDone: "Checked your connected accounts" },
  get_brand_profile: { category: "RESEARCH", verb: "Checking your brand voice…", verbDone: "Checked your brand voice" },
  get_content_calendar: { category: "RESEARCH", verb: "Checking your calendar…", verbDone: "Checked your calendar" },
  analyze_climb_replay: { category: "RESEARCH", verb: "Decoding your replay for highlights…", verbDone: "Decoded your replay" },

  create_content_idea: { category: "CREATE", verb: "Writing platform-adapted drafts…", verbDone: "Wrote your drafts" },
  generate_script: { category: "CREATE", verb: "Writing your script…", verbDone: "Wrote your script" },
  generate_caption: { category: "CREATE", verb: "Writing your caption…", verbDone: "Wrote your caption" },
  generate_title: { category: "CREATE", verb: "Writing your title…", verbDone: "Wrote your title" },
  generate_description: { category: "CREATE", verb: "Writing your description…", verbDone: "Wrote your description" },
  create_content_variations: { category: "CREATE", verb: "Writing alternate versions…", verbDone: "Wrote alternate versions" },
  repurpose_content: { category: "CREATE", verb: "Repurposing your content…", verbDone: "Repurposed your content" },
  create_post: { category: "CREATE", verb: "Creating your post…", verbDone: "Created your post" },
  create_thread: { category: "CREATE", verb: "Creating your thread…", verbDone: "Created your thread" },
  prepare_video_upload: { category: "CREATE", verb: "Preparing your video upload…", verbDone: "Prepared your video upload" },

  schedule_content: { category: "PUBLISH", verb: "Scheduling…", verbDone: "Scheduled" },
  publish_content: { category: "PUBLISH", verb: "Publishing…", verbDone: "Published" },

  get_social_analytics: { category: "MEASURE", verb: "Checking performance…", verbDone: "Checked performance" },
  analyze_content_performance: { category: "MEASURE", verb: "Ranking your top content…", verbDone: "Ranked your top content" },
  generate_weekly_strategy: { category: "MEASURE", verb: "Building next week's plan…", verbDone: "Built next week's plan" },
};

export const TOOLS_BY_CATEGORY: Record<ToolCategory, SocialAgentToolName[]> = (
  Object.keys(TOOL_CATEGORIES) as SocialAgentToolName[]
).reduce(
  (acc, name) => {
    acc[TOOL_CATEGORIES[name].category].push(name);
    return acc;
  },
  { RESEARCH: [], CREATE: [], PUBLISH: [], MEASURE: [] } as Record<ToolCategory, SocialAgentToolName[]>
);

export function isKnownToolCategoryName(name: string | null | undefined): name is SocialAgentToolName {
  return !!name && Object.prototype.hasOwnProperty.call(TOOL_CATEGORIES, name);
}
