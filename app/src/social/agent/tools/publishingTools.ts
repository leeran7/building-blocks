import { createDraftContentItem } from "../../services/contentGeneration";
import { initiateContentUpload } from "../../services/uploadSessions";
import { scheduleContent } from "../../services/scheduling";
import { publishContentItem } from "../../services/publishing";
import { errResult } from "../../types";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

type ToolCtx = { uid: string };

export async function createPostTool(input: z.infer<typeof TOOL_SCHEMAS.create_post>, ctx: ToolCtx) {
  return createDraftContentItem({
    platform: input.platform,
    contentType: input.contentType,
    title: input.title,
    hook: input.hook,
    script: input.script,
    caption: input.caption,
    description: input.description,
    hashtags: input.hashtags,
    cta: input.cta,
    createdByUid: ctx.uid,
    sourceToolName: "create_post",
  });
}

export async function createThreadTool(input: z.infer<typeof TOOL_SCHEMAS.create_thread>, ctx: ToolCtx) {
  if (input.threadParts.length < 1) {
    return errResult("VALIDATION_ERROR", "A thread needs at least one part");
  }
  return createDraftContentItem({
    platform: "X",
    contentType: "X_THREAD",
    title: input.title,
    threadParts: input.threadParts,
    hashtags: input.hashtags,
    createdByUid: ctx.uid,
    sourceToolName: "create_thread",
  });
}

export async function prepareVideoUploadTool(input: z.infer<typeof TOOL_SCHEMAS.prepare_video_upload>) {
  return initiateContentUpload({
    contentItemId: input.contentItemId,
    kind: input.kind,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
}

export async function scheduleContentTool(input: z.infer<typeof TOOL_SCHEMAS.schedule_content>, ctx: ToolCtx) {
  return scheduleContent(input.contentItemId, new Date(input.scheduledAtIso), input.socialAccountId, ctx.uid);
}

export async function publishContentTool(input: z.infer<typeof TOOL_SCHEMAS.publish_content>, ctx: ToolCtx) {
  return publishContentItem(input.contentItemId, ctx.uid);
}
