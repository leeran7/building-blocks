import { generateWeeklyStrategy } from "../../services/weeklyStrategy";
import { currentIsoWeek } from "../../isoWeek";
import type { TOOL_SCHEMAS } from "../toolRegistry";
import type { z } from "zod";

type ToolCtx = { uid: string };

export async function generateWeeklyStrategyTool(
  input: z.infer<typeof TOOL_SCHEMAS.generate_weekly_strategy>,
  ctx: ToolCtx
) {
  const isoWeek = input.isoWeek || currentIsoWeek();
  return generateWeeklyStrategy(isoWeek, ctx.uid);
}
