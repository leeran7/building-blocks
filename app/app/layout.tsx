import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../src/contexts/AuthContext";
import { resolveBaseUrl } from "../src/config/public";
import { formatAltitude } from "../src/lib/units";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_URL, ogImageUrl } from "../src/lib/seo";

// ── ASCENT type system ────────────────────────────────────────────────────
// Display: Bricolage Grotesque — architectural, contemporary, characterful.
// Body:    Hanken Grotesk — warm, refined, highly legible (not Inter/Roboto).
// Mono:    Space Mono — instrument/altimeter readouts + tabular numerics.
// adjustFontFallback:false — Next 14 lacks size-adjust fallback metrics for these
// newer Google fonts ("Failed to find font override values"); disable the auto
// override and provide an explicit fallback stack instead.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

// Localhost in dev, the prod domain in production (see resolveBaseUrl).
const BASE_URL = resolveBaseUrl();

// viewport-fit: cover lets the climb game go truly edge-to-edge on notched
// iPhones — the canvas fills under the status bar / home indicator and the HUD
// and touch controls inset themselves with env(safe-area-inset-*). Without it
// those insets all report 0 and the full-bleed stage cannot dodge the notch.
export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  let topBlockId = "";
  let topBlockName = "Stack";
  let topAlt = "0";

  try {
    const res = await fetch(`${BASE_URL}/api/tower`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      const topBlock = data.blocks?.[0];
      if (topBlock) {
        topBlockId = topBlock.id;
        topBlockName = topBlock.display_name;
        topAlt = String(topBlock.altitude);
      }
    }
  } catch {
    // Fail silently — metadata is not critical path
  }

  const ogUrl = ogImageUrl({ v: topBlockId, name: topBlockName, alt: topAlt, rank: "1" });

  // Inert until the real tokens exist — set after creating the Google Search
  // Console / Bing Webmaster Tools properties for this domain. No fabricated
  // values here; unset env vars just omit the tag entirely.
  const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
  const bingVerification = process.env.BING_SITE_VERIFICATION;

  return {
    metadataBase: new URL(SITE_URL),
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    alternates: { canonical: SITE_URL },
    ...(googleVerification || bingVerification
      ? {
          verification: {
            ...(googleVerification ? { google: googleVerification } : {}),
            ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
          },
        }
      : {}),
    openGraph: {
      title: DEFAULT_TITLE,
      description: "Your altitude is permanent. The ground rises instead.",
      url: SITE_URL,
      siteName: "Doomstack",
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: `Doomstack — ${topBlockName} leads at ${formatAltitude(parseFloat(topAlt), 1)}`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_TITLE,
      description: "Your altitude is permanent. The ground rises instead.",
      images: [ogUrl],
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="bg-void text-text-primary font-sans min-h-screen antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-signal focus:px-4 focus:py-2 focus:text-void focus:font-semibold"
        >
          Skip to content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
