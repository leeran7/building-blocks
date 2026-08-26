import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../src/contexts/AuthContext";
import { PUBLIC_CONFIG } from "../src/config/public";

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

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
// Public canonical origin — used for OG/Twitter image + canonical URL resolution.
const SITE_URL = PUBLIC_CONFIG.siteUrl;

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

  const ogUrl = `${BASE_URL}/api/og?v=${topBlockId}&name=${encodeURIComponent(topBlockName)}&alt=${topAlt}&rank=1`;

  return {
    metadataBase: new URL(SITE_URL),
    title: "Doomstack — Altitude is permanent",
    description:
      "Your altitude is permanent. The ground rises instead. The price of #1 falls with every thousand views — until someone buys it.",
    openGraph: {
      title: "Doomstack — Altitude is permanent",
      description: "Your altitude is permanent. The ground rises instead.",
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: `Doomstack — ${topBlockName} leads at ${parseFloat(topAlt).toFixed(1)}m`,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Doomstack — Altitude is permanent",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
