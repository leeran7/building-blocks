import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { repurposeContent, RepurposeError } from "../../../../../../src/social/services/repurposing";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:repurpose",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { targets?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }
  if (!Array.isArray(body.targets) || body.targets.length === 0) {
    return jsonError("targets must be a non-empty array", 400, "VALIDATION_ERROR");
  }

  try {
    const items = await repurposeContent(params.id, body.targets as never, decoded.uid);
    return jsonOk({ items });
  } catch (err) {
    if (err instanceof RepurposeError) return jsonError(err.message, 422, "REPURPOSE_FAILED");
    throw err;
  }
});
