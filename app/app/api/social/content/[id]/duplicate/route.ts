import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { duplicateContentItem } from "../../../../../../src/db/social/contentItems";
import { writeAuditLog } from "../../../../../../src/db/social/auditLog";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:duplicate",
    identifier: decoded.uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const duplicated = await duplicateContentItem(params.id, decoded.uid);
  if (!duplicated) return jsonError("Content item not found", 404, "NOT_FOUND");

  await writeAuditLog({
    action: "DUPLICATE_CONTENT",
    result: "SUCCESS",
    initiator: decoded.uid,
    platform: duplicated.platform,
    contentItemId: duplicated.id,
    metadata: { sourceContentItemId: params.id },
  });

  return jsonOk(duplicated);
});
