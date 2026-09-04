/**
 * PUT /api/social/content/:id/assets/upload-sessions/:assetId/chunk (§4.7,
 * ADR-4). Raw bytes body, `X-Chunk-Range: bytes {start}-{end}/{total}`. Each
 * chunk is its own bounded, short-lived invocation — the file is never held
 * in memory across more than one chunk's worth of bytes at a time.
 */

import { withSocialAdminParams, jsonOk, jsonError, fromToolResult, enforceRateLimit } from "../../../../../../../../../src/api/social/routeHelpers";
import { relayUploadChunk } from "../../../../../../../../../src/social/services/uploadSessions";

export const runtime = "nodejs";

const RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+)$/;

export const PUT = withSocialAdminParams<{ id: string; assetId: string }>(async (request, decoded, params) => {
  // Cheap, small, bounded per-chunk request — high per-minute ceiling (ADR-4).
  const limited = await enforceRateLimit(request, {
    namespace: "social:assets:chunk",
    identifier: decoded.uid,
    max: 300,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const rangeHeader = request.headers.get("X-Chunk-Range");
  const match = rangeHeader ? RANGE_PATTERN.exec(rangeHeader) : null;
  if (!match) {
    return jsonError('X-Chunk-Range header required, e.g. "bytes 0-4194303/10000000"', 400, "VALIDATION_ERROR");
  }
  const [, startStr, endStr, totalStr] = match;
  const rangeStart = Number(startStr);
  const rangeEnd = Number(endStr);
  const totalBytes = Number(totalStr);

  const arrayBuffer = await request.arrayBuffer();
  const chunk = Buffer.from(arrayBuffer);

  const result = await relayUploadChunk(params.assetId, chunk, rangeStart, rangeEnd, totalBytes);
  if (!result.ok) return fromToolResult(result);

  return jsonOk({
    nextByteOffset: rangeEnd + 1,
    complete: result.data.complete,
    ...(result.data.complete && result.data.externalAssetId ? { externalAssetId: result.data.externalAssetId } : {}),
  });
});
