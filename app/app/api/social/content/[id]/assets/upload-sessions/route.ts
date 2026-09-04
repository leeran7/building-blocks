import { withSocialAdminParams, jsonOk, jsonError, fromToolResult, enforceRateLimit } from "../../../../../../../src/api/social/routeHelpers";
import { initiateContentUpload } from "../../../../../../../src/social/services/uploadSessions";

export const runtime = "nodejs";

const VALID_KINDS = ["VIDEO", "IMAGE"];

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:assets:init",
    identifier: decoded.uid,
    max: 10,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  let body: { kind?: unknown; filename?: unknown; mimeType?: unknown; sizeBytes?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, "VALIDATION_ERROR");
  }
  if (
    typeof body.kind !== "string" ||
    !VALID_KINDS.includes(body.kind) ||
    typeof body.filename !== "string" ||
    typeof body.mimeType !== "string" ||
    typeof body.sizeBytes !== "number"
  ) {
    return jsonError("kind, filename, mimeType, sizeBytes are required", 400, "VALIDATION_ERROR");
  }

  const result = await initiateContentUpload({
    contentItemId: params.id,
    kind: body.kind as never,
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  if (!result.ok) return fromToolResult(result);
  return jsonOk({ assetId: result.data.assetId, chunkSizeBytes: result.data.chunkSizeBytes, nextByteOffset: 0 });
});
