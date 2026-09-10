/**
 * GET /api/og
 *
 * Static brand OG image for Doomstack (free climb + duels + tournaments).
 * Edge runtime for fast response at CDN.
 * Cache-Control: s-maxage=3600, stale-while-revalidate=86400
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(_request: NextRequest): Promise<ImageResponse | Response> {
  try {
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
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.3em",
              color: "#0ea5e9",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            DOOMSTACK
          </div>

          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              textAlign: "center",
              maxWidth: "80%",
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            Climb higher. Duel for the pot.
          </div>

          <div
            style={{
              fontSize: 20,
              color: "#94a3b8",
              textAlign: "center",
              maxWidth: "70%",
            }}
          >
            A skill-based endless climb — free leaderboard, ranked duels, and tournaments.
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    const headers = new Headers(image.headers);
    headers.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

    return new Response(await image.arrayBuffer(), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[GET /api/og]", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
