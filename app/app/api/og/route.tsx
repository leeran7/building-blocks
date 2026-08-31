/**
 * GET /api/og
 *
 * Dynamic OG image of the current top block.
 * Edge runtime for fast response at CDN.
 * Cache-Control: s-maxage=60, stale-while-revalidate=300
 * Cache-busted by ?v={top_block_id}
 *
 * Query params are attacker-controlled display text: sanitized, A-12
 * defaults for missing values, never 500 on junk.
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { ListingOgCard } from "../../../src/og/card";
import { buildListingOgModel } from "../../../src/og/listingModel";
import { ogPngResponse } from "../../../src/og/respond";
import { LISTING_OG_CACHE_CONTROL, listingOgImageOptions } from "../../../src/og/sizes";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const model = buildListingOgModel({
      name: searchParams.get("name"),
      alt: searchParams.get("alt"),
      rank: searchParams.get("rank"),
    });

    const image = new ImageResponse(
      <ListingOgCard {...model} />,
      listingOgImageOptions()
    );

    return ogPngResponse(image, LISTING_OG_CACHE_CONTROL);
  } catch (error) {
    console.error("[GET /api/og]", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
