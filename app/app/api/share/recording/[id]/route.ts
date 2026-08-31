/**
 * GET /api/share/recording/[id] — public JSON share payload for Atlas / ShareRun.
 * `{ ok: true, data }` on 200; `{ error, code: "NOT_FOUND" }` on 404.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveBaseUrl } from "../../../../../src/config/public";
import { getShareableClimbRun } from "../../../../../src/db/climb";
import { checkRateLimit, clientIp } from "../../../../../src/lib/rateLimit";
import { SHARE_JSON_CACHE_CONTROL } from "../../../../../src/og/sizes";
import { buildRecordingSharePayload } from "../../../../../src/share/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const rl = await checkRateLimit({
      namespace: "share-recording",
      identifier: clientIp(request),
      max: 60,
      windowSeconds: 60,
      failMode: "open",
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const { id } = await context.params;
    const recording = await getShareableClimbRun(id);
    const result = buildRecordingSharePayload(recording, resolveBaseUrl());
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Recording not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: result.detail, code: "VALIDATION_ERROR" },
        { status: 422 }
      );
    }

    const res = NextResponse.json({ ok: true, data: result.data });
    res.headers.set("Cache-Control", SHARE_JSON_CACHE_CONTROL);
    return res;
  } catch (err) {
    console.error("[GET /api/share/recording]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
