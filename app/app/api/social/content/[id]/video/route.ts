/**
 * GET /api/social/content/:id/video — poll AI video generation status (Runway Gen-4.5).
 * When complete, returns a preview URL (Vercel Blob or local proxy).
 *
 * GET with ?assetId= streams the MP4 when stored on local disk (dev fallback).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  withSocialAdminParams,
  jsonOk,
  fromToolResult,
  enforceRateLimit,
} from "../../../../../../src/api/social/routeHelpers";
import {
  refreshVideoGenerationStatus,
  readStoredVideoFile,
  startVideoGenerationForContentItem,
} from "../../../../../../src/social/services/videoGeneration";

export const runtime = "nodejs";
export const maxDuration = 120;

export const GET = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:video",
    identifier: decoded.uid,
    max: 30,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const assetId = request.nextUrl.searchParams.get("assetId") ?? undefined;

  // Dev fallback: stream locally stored file when assetId is provided.
  if (assetId && request.nextUrl.searchParams.get("stream") === "1") {
    const bytes = await readStoredVideoFile(params.id, assetId);
    if (!bytes) return NextResponse.json({ error: "Video file not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const result = await refreshVideoGenerationStatus(params.id, assetId);
  if (!result.ok) return fromToolResult(result);

  const videoUrl = result.data.videoUrl;
  if (videoUrl?.startsWith("/api/social/content/")) {
    result.data.videoUrl = `${videoUrl}&stream=1`;
  }

  return jsonOk(result.data);
});

export const POST = withSocialAdminParams<{ id: string }>(async (request, decoded, params) => {
  const limited = await enforceRateLimit(request, {
    namespace: "social:content:video:start",
    identifier: decoded.uid,
    max: 5,
    windowSeconds: 60,
    failMode: "closed",
  });
  if (limited) return limited;

  const started = await startVideoGenerationForContentItem(params.id);
  if (!started.ok) return fromToolResult(started);
  const status = await refreshVideoGenerationStatus(params.id, started.data.assetId);
  if (!status.ok) return fromToolResult(status);
  return jsonOk(status.data);
});
