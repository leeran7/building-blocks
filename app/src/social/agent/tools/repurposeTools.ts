import { repurposeContent } from "../../services/repurposing";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

type ToolCtx = { uid: string };

export async function repurposeContentTool(input: z.infer<typeof TOOL_SCHEMAS.repurpose_content>, ctx: ToolCtx) {
  return repurposeContent(input.contentItemId, input.targets, ctx.uid);
}
