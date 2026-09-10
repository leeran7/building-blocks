/**
 * Landing page — Stack v2
 *
 * AC-27: DOM contains hero, how-it-works (3 steps), category grid (6 cards), footer
 * AC-28: Live data in category cards
 * AC-29: API failures degrade gracefully — card shows "--"
 * AC-30: Footer has <a href="/auth/signup"> with "Get started" text
 * AC-31: 375px layout works, no horizontal overflow
 * AC-32: Background = #0a0a0f (set on body in layout.tsx)
 */

import { Hero } from "../src/components/LandingPage/Hero";
import { FreeLeaderboard } from "../src/components/LandingPage/FreeLeaderboard";
import { DuelPromo } from "../src/components/LandingPage/DuelPromo";
import { Footer } from "../src/components/LandingPage/Footer";
import { Faq, buildFaqs } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { JsonLd } from "../src/components/JsonLd";
import { getBlockCountsByCategory } from "../src/db/blocks";
import { getGlobalClimbStats } from "../src/db/climb";
import { GAME_CATEGORIES } from "../src/game/categories";
import { organizationJsonLd, websiteJsonLd } from "../src/lib/seo";
import { Suspense } from "react";

// ISR: serve the landing from cache and regenerate at most once per 60s, so the
// highest-traffic page doesn't hit the DB (block counts + social proof) on every
// request. Live tower data still updates via the polled API on the stack views.
export const revalidate = 60;

async function getSocialProofData(): Promise<{
  totalBlocks: number;
  arenaCount: number;
} | null> {
  try {
    // Count real blocks across the game-category stacks (the legacy broad slugs
    // this used to fetch no longer resolve). One grouped query, ISR-cached.
    const counts = await getBlockCountsByCategory();
    const totalBlocks = GAME_CATEGORIES.reduce(
      (acc, c) => acc + (counts[c.slug] ?? 0),
      0
    );
    return { totalBlocks, arenaCount: GAME_CATEGORIES.length };
  } catch {
    return null;
  }
}

async function SocialProofStrip() {
  const proof = await getSocialProofData();

  return (
    <div className="border-y border-border-subtle bg-surface/40 py-3">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-secondary text-center flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" aria-hidden="true" />
        {proof ? (
          <>
            <span className="font-bold text-signal tabular-nums">
              {proof.totalBlocks}
            </span>
            {" blocks live · free duels always on"}
          </>
        ) : (
          "Free duels always on"
        )}
      </p>
    </div>
  );
}

export default async function HomePage() {
  const climbStats = await getGlobalClimbStats().catch(() => ({
    climberCount: 0,
    topPeak: null,
  }));

  const faqJsonLd = {
    "@type": "FAQPage",
    mainEntity: buildFaqs().map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <main id="main-content" className="grain min-h-screen bg-void">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), faqJsonLd]} />
      <Navbar />

      <Hero
        stats={{
          climberCount: climbStats.climberCount,
          topPeak: climbStats.topPeak,
        }}
      />

      <Suspense
        fallback={
          <div className="border-y border-border-subtle bg-surface/40 py-3">
            <div className="h-4 bg-border-subtle rounded w-48 mx-auto animate-pulse" />
          </div>
        }
      >
        <SocialProofStrip />
      </Suspense>

      <DuelPromo />

      <FreeLeaderboard />

      <Faq />

      <Footer />
    </main>
  );
}
