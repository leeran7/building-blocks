/**
 * GET /api/og
 *
 * Static brand OG image for Doomstack (free climb + duels + tournaments).
 * Logo-forward: reproduces the StackMark app-icon tile (three descending bars
 * in the brand duotone) alongside the wordmark and tagline, so shared links
 * carry the mark rather than bare text.
 *
 * Edge runtime for fast response at CDN.
 * Cache-Control: s-maxage=3600, stale-while-revalidate=86400
 */

import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Brand duotone (mirrors src/components/Brand/StackMark.tsx)
const LIME = "#cbf24d";
const SLATE = "#6b6b8a";
const EMBER = "#ff5a2c";

/** The StackMark logo, rebuilt with Satori-safe divs (SVG rect scales oddly). */
function LogoTile() {
  const bar = (width: number, color: string) => (
    <div
      style={{
        display: "flex",
        width,
        height: 15,
        borderRadius: 8,
        backgroundColor: color,
      }}
    />
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 12,
        width: 148,
        height: 148,
        paddingLeft: 30,
        borderRadius: 34,
        backgroundColor: "#0a0a0a",
        border: `1px solid ${LIME}33`,
        boxShadow: `0 0 0 1px #ffffff0d, 0 24px 70px -20px ${LIME}55`,
      }}
    >
      {bar(84, LIME)}
      {bar(62, SLATE)}
      {bar(42, EMBER)}
    </div>
  );
}

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
            background:
              "radial-gradient(1200px 600px at 50% -10%, #1b2a3f 0%, #0f172a 45%, #0a0f1c 100%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#f8fafc",
            position: "relative",
          }}
        >
          {/* Top accent hairline */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: 6,
              background: `linear-gradient(90deg, ${LIME} 0%, ${SLATE} 55%, ${EMBER} 100%)`,
            }}
          />

          <LogoTile />

          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "0.34em",
              color: LIME,
              textTransform: "uppercase",
              marginTop: 40,
              marginBottom: 18,
              paddingLeft: "0.34em",
            }}
          >
            DOOMSTACK
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 62,
              fontWeight: 800,
              textAlign: "center",
              maxWidth: "82%",
              lineHeight: 1.1,
              marginBottom: 20,
            }}
          >
            Climb higher. Outlast everyone.
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "#94a3b8",
              textAlign: "center",
              maxWidth: "72%",
              lineHeight: 1.3,
            }}
          >
            A skill-based endless climb — free leaderboard, ranked duels, and tournaments.
          </div>

          {/* Domain pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              position: "absolute",
              bottom: 40,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: LIME,
              padding: "10px 22px",
              borderRadius: 999,
              backgroundColor: "#cbf24d14",
              border: `1px solid ${LIME}33`,
            }}
          >
            doomstack.lol
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
