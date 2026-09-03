import { analyzeClimbReplay } from "../../services/replayAnalysis";
import { okResult, errResult } from "../../types";

export async function analyzeClimbReplayTool(input: { replayUrl: string }) {
  if (!input.replayUrl?.trim()) {
    return errResult("VALIDATION_ERROR", "replayUrl is required");
  }
  try {
    const analysis = await analyzeClimbReplay(input.replayUrl);
    return okResult(analysis);
  } catch (err) {
    return errResult("VALIDATION_ERROR", (err as Error).message);
  }
}
