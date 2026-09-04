/**
 * POST /api/social/content/:id/publish — manual "publish now" (§4.6).
 * Uses the exact same claim/idempotency path as the cron publish-sweep
 * (ADR-3) — a concurrent/duplicate call is a no-op, never a double-post
 * (AC-36).
 */

import { withSocialAdminParams, jsonOk, fromToolResult, enforceRateLimit } from "../../../../../../src/api/social/routeHelpers";
import { publishContentItem } from "../../../../../../src/social/services/publishing";
import { listPublicationsForItem } from "../../../../../../src/db/social/publications";

export const runtime = "nodejs";

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:publish",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const result = await publishContentItem(params.id, decoded.uid);
  const publications = await listPublicationsForItem(params.id);

  if (!result.ok) return fromToolResult(result);
  return jsonOk({ contentItemId: result.data.contentItemId, status: result.data.status, publication: publications[0] ?? null });
});
