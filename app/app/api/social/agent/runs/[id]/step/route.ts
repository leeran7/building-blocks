/**
 * POST /api/social/agent/runs/:id/step — advance one resumable step (§4.9,
 * ADR-1). Client calls this in a loop while status is RUNNING or
 * WAITING_ON_STEP.
 */

import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../../src/api/social/routeHelpers";
import { runNextChatStep } from "../../../../../../../src/social/agent/chatRunner";
import { getAgentRun } from "../../../../../../../src/db/social/agentRuns";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:agent:runs:step",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const existing = await getAgentRun(params.id);
  if (!existing) return jsonError("Agent run not found", 404, "NOT_FOUND");
  if (existing.kind !== "CHAT_TURN") {
    return jsonError("Only CHAT_TURN runs can be stepped via this endpoint", 400, "VALIDATION_ERROR");
  }

  const result = await runNextChatStep(params.id, decoded.uid);
  return jsonOk({
    runId: result.run.id,
    status: result.run.status,
    currentStepIndex: result.run.currentStepIndex,
    assistantText: result.assistantText,
    toolCalls: result.task ? [result.task] : [],
  });
});
