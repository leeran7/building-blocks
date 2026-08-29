import { withSocialAdminParams, fromToolResult, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { approveContent } from "../../../../../../src/social/services/approvalWorkflow";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:approve",
    identifier: decoded.uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const result = await approveContent(params.id, decoded.uid);
  return fromToolResult(result);
});
