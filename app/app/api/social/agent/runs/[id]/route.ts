/**
 * GET /api/social/agent/runs/:id — full transcript for a run (AC-58).
 */

import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { getAgentRunWithTasks } from "../../../../../../src/db/social/agentRuns";

export const runtime = "nodejs";

export const GET = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:agent:runs:get",
    identifier: decoded.uid,
    max: 60,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const run = await getAgentRunWithTasks(params.id);
  if (!run) return jsonError("Agent run not found", 404, "NOT_FOUND");

  const { tasks, ...runData } = run;
  return jsonOk({ run: runData, tasks });
});
