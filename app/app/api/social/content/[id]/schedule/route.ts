import { withSocialAdminParams, jsonError, fromToolResult, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { scheduleContent } from "../../../../../../src/social/services/scheduling";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:schedule",
    identifier: decoded.uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { scheduledAt?: unknown; socialAccountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }
  if (typeof body.scheduledAt !== "string" || typeof body.socialAccountId !== "string") {
    return jsonError("scheduledAt and socialAccountId are required", 400, "VALIDATION_ERROR");
  }

  const result = await scheduleContent(params.id, new Date(body.scheduledAt), body.socialAccountId, decoded.uid);
  return fromToolResult(result);
});
