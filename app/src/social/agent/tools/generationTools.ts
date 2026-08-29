import {
  generateContentForPlatforms,
  regenerateContentField,
  createContentVariations,
} from "../../services/contentGeneration";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

type ToolCtx = { uid: string };

export async function createContentIdeaTool(
  input: z.infer<typeof TOOL_SCHEMAS.create_content_idea>,
  ctx: ToolCtx
) {
  return generateContentForPlatforms({ prompt: input.prompt, platforms: input.platforms, createdByUid: ctx.uid });
}

export async function generateScriptTool(input: z.infer<typeof TOOL_SCHEMAS.generate_script>, ctx: ToolCtx) {
  return regenerateContentField(input.contentItemId, "script", input.instructions, ctx.uid);
}

export async function generateCaptionTool(input: z.infer<typeof TOOL_SCHEMAS.generate_caption>, ctx: ToolCtx) {
  return regenerateContentField(input.contentItemId, "caption", input.instructions, ctx.uid);
}

export async function generateTitleTool(input: z.infer<typeof TOOL_SCHEMAS.generate_title>, ctx: ToolCtx) {
  return regenerateContentField(input.contentItemId, "title", input.instructions, ctx.uid);
}

export async function generateDescriptionTool(
  input: z.infer<typeof TOOL_SCHEMAS.generate_description>,
  ctx: ToolCtx
) {
  return regenerateContentField(input.contentItemId, "description", input.instructions, ctx.uid);
}

export async function createContentVariationsTool(
  input: z.infer<typeof TOOL_SCHEMAS.create_content_variations>,
  ctx: ToolCtx
) {
  return createContentVariations(input.contentItemId, input.count, ctx.uid);
}
