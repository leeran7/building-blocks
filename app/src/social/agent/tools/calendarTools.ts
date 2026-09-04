import { listContentItems } from "../../../db/social/contentItems";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

type Input = z.infer<typeof TOOL_SCHEMAS.get_content_calendar>;

/** get_content_calendar — read-only. */
export async function getContentCalendarTool(input: Input) {
  return listContentItems({
    status: input.status,
    platform: input.platform,
    from: input.fromIso ? new Date(input.fromIso) : undefined,
    to: input.toIso ? new Date(input.toIso) : undefined,
  });
}
