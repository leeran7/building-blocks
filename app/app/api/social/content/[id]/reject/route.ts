import { withSocialAdminParams, fromToolResult, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { rejectContent } from "../../../../../../src/social/services/approvalWorkflow";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:reject",
    identifier: decoded.uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // reason is optional
  }

  const result = await rejectContent(params.id, decoded.uid, typeof body.reason === "string" ? body.reason : undefined);
  return fromToolResult(result);
});
