/**
 * POST /api/social/agent/runs — start a new CHAT_TURN AgentRun (§4.9). Runs
 * step 0 synchronously and returns its outcome; the client keeps calling
 * `/step` while status is RUNNING/WAITING_ON_STEP (ADR-1).
 */

import { withSocialAdmin, jsonOk, jsonError, enforceRateLimit } from "../../../../../src/api/social/routeHelpers";
import { createChatRun } from "../../../../../src/social/agent/chatRunner";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withSocialAdmin(async (request, decoded) => {
  // Fail closed — creates DB rows and calls the LLM.
  const limited = await enforceRateLimit(request, {
    namespace: "social:agent:runs:create",
    identifier: decoded.uid,
    max: 20,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { kind?: unknown; message?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }
  if (body.kind !== "CHAT_TURN") return jsonError('kind must be "CHAT_TURN"', 400, "VALIDATION_ERROR");
  if (typeof body.message !== "string" || !body.message.trim()) {
    return jsonError("message is required", 400, "VALIDATION_ERROR");
  }

  const result = await createChatRun(
    decoded.uid,
    body.message,
    typeof body.conversationId === "string" ? body.conversationId : undefined
  );

  return jsonOk({
    runId: result.run.id,
    status: result.run.status,
    assistantText: result.assistantText,
    toolCalls: result.task ? [result.task] : [],
  });
});
