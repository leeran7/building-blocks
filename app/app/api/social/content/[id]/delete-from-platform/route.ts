/**
 * POST /api/social/content/:id/delete-from-platform (§4.6, AC-54). Distinct,
 * explicit authorization — deleting the LIVE platform post is never implied
 * by general admin access; both `confirm: true` and a `reason` are required.
 */

import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { getContentItemById } from "../../../../../../src/db/social/contentItems";
import { getDecryptedTokens, setAccountStatus } from "../../../../../../src/db/social/socialAccounts";
import { getProvider } from "../../../../../../src/social/providers/registry";
import { writeAuditLog } from "../../../../../../src/db/social/auditLog";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:delete-from-platform",
    identifier: decoded.uid,
    max: 5,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { confirm?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }
  if (body.confirm !== true || typeof body.reason !== "string" || !body.reason.trim()) {
    return jsonError("confirm: true and a non-empty reason are required (AC-54)", 400, "VALIDATION_ERROR");
  }

  const item = await getContentItemById(params.id);
  if (!item) return jsonError("Content item not found", 404, "NOT_FOUND");
  if (item.status !== "PUBLISHED" || !item.externalPostId || !item.socialAccountId) {
    return jsonError("Item has no live platform post to delete", 400, "VALIDATION_ERROR");
  }

  const tokens = await getDecryptedTokens(item.socialAccountId);
  if (!tokens) {
    await setAccountStatus(item.socialAccountId, "REAUTH_REQUIRED");
    return jsonError("Connected account needs to be reconnected", 409, "REAUTH_REQUIRED");
  }

  const provider = getProvider(item.platform);
  const result = await provider.deletePost(tokens.accessToken, item.externalPostId);

  await writeAuditLog({
    action: "DELETE_PLATFORM_POST",
    result: result.ok ? "SUCCESS" : "FAILURE",
    initiator: decoded.uid,
    platform: item.platform,
    contentItemId: item.id,
    socialAccountId: item.socialAccountId,
    errorDetail: result.ok ? null : result.detail,
    metadata: { reason: body.reason },
  });

  if (!result.ok) return jsonError(result.detail, result.reason === "UNSUPPORTED_BY_PLATFORM" ? 422 : 502, result.reason);
  return jsonOk({ id: item.id, platformDeleteResult: "DELETED" });
});
