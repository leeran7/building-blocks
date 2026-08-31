/**
 * GET /api/og/b/[slug] — record (listing) OG card, 1200×630, OG_PALETTE.
 */

import { ImageResponse } from "@vercel/og";
import { NextResponse } from "next/server";
import { getBlockBySlug } from "../../../../../src/db/blocks";
import { parseSeasonSlug } from "../../../../../src/game/categories";
import { RecordOgCard } from "../../../../../src/og/card";
import { sanitizeOgText } from "../../../../../src/og/sanitize";
import { ogPngResponse } from "../../../../../src/og/respond";
import { RECORD_OG_CACHE_CONTROL, recordOgImageOptions } from "../../../../../src/og/sizes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await context.params;
  const parsed = parseSeasonSlug(slug);
  if (!parsed) {
    return NextResponse.json(
      { error: "Record not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }
  const block = await getBlockBySlug(parsed);
  if (!block) {
    return NextResponse.json(
      { error: "Record not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const displayName =
      sanitizeOgText(block.display_name, 80) || block.display_name;
    const image = new ImageResponse(
      <RecordOgCard
        displayName={displayName}
        altitudeM={Math.round(block.altitude)}
      />,
      recordOgImageOptions()
    );
    return ogPngResponse(image, RECORD_OG_CACHE_CONTROL);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate OG image", code: "OG_RENDER_FAILED" },
      { status: 500 }
    );
  }
}
