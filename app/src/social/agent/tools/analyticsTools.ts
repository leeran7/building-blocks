import { getAnalyticsOverview, analyzeContentPerformance } from "../../services/analyticsIngestion";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

export async function getSocialAnalyticsTool(input: z.infer<typeof TOOL_SCHEMAS.get_social_analytics>) {
  return getAnalyticsOverview(
    input.platform,
    input.fromIso ? new Date(input.fromIso) : undefined,
    input.toIso ? new Date(input.toIso) : undefined
  );
}

export async function analyzeContentPerformanceTool(
  input: z.infer<typeof TOOL_SCHEMAS.analyze_content_performance>
) {
  return analyzeContentPerformance(input.platform, input.limit);
}
