/**
 * GET /api/og
 *
 * Dynamic OG image of the current top block.
 * Edge runtime for fast response at CDN.
 * Cache-Control: s-maxage=60, stale-while-revalidate=300
 * Cache-busted by ?v={top_block_id}
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<ImageResponse | Response> {
  try {
    const { searchParams } = new URL(request.url);
    const blockName = searchParams.get("name") ?? "Tower";
    const altitude = searchParams.get("alt") ?? "0";
    const rank = searchParams.get("rank") ?? "1";

    const image = new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#f8fafc",
          }}
        >
          {/* Tower wordmark */}
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.3em",
              color: "#0ea5e9",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            TOWER
          </div>

          {/* Rank badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0ea5e9",
              color: "#0f172a",
              borderRadius: 8,
              padding: "4px 16px",
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            #{rank}
          </div>

          {/* Block name */}
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              textAlign: "center",
              maxWidth: "80%",
              lineHeight: 1.2,
              marginBottom: 12,
            }}
          >
            {blockName}
          </div>

          {/* Altitude */}
          <div
            style={{
              fontSize: 20,
              color: "#94a3b8",
              marginBottom: 24,
            }}
          >
            {parseFloat(altitude).toFixed(1)}m altitude
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 16,
              color: "#64748b",
              textAlign: "center",
              maxWidth: "60%",
            }}
          >
            Your altitude is permanent. The ground rises instead.
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    // Set cache headers on the response
    const headers = new Headers(image.headers);
    headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

    return new Response(await image.arrayBuffer(), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[GET /api/og]", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
