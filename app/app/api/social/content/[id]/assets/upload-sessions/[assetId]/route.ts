/**
 * GET /api/social/content/:id/assets/upload-sessions/:assetId (§4.7) — the
 * resume point after a dropped connection.
 */

import { withSocialAdminParams, jsonOk, jsonError, enforceRateLimit } from "../../../../../../../../src/api/social/routeHelpers";
import { getUploadSession, toPublicAsset } from "../../../../../../../../src/db/social/contentAssets";

export const runtime = "nodejs";

export const GET = withSocialAdminParams<{ id: string; assetId: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:assets:status",
    identifier: decoded.uid,
    max: 120,
    windowSeconds: 60,
    failMode: "open",
  });
  if (limited) return limited;

  const asset = await getUploadSession(params.assetId);
  if (!asset || asset.contentItemId !== params.id) return jsonError("Upload session not found", 404, "NOT_FOUND");

  const pub = toPublicAsset(asset);
  return jsonOk({ status: pub.status, bytesUploaded: pub.bytesUploaded, sizeBytes: pub.sizeBytes, errorMessage: pub.errorMessage });
});
