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
import { RankedLeaderboard } from "../src/components/LandingPage/RankedLeaderboard";
import { DuelPromo } from "../src/components/LandingPage/DuelPromo";
import { Faq, buildFaqs } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { JsonLd } from "../src/components/JsonLd";
import { getGlobalClimbStats } from "../src/db/climb";
import { getChipDuelStats } from "../src/db/chips";
import { AboutDoomstack } from "../src/components/LandingPage/AboutDoomstack";
import { organizationJsonLd, websiteJsonLd, videoGameJsonLd } from "../src/lib/seo";
import { Suspense } from "react";

// ISR: serve the landing from cache and regenerate at most once per 60s, so the
// highest-traffic page doesn't hit the DB (climb stats) on every request.
export const revalidate = 60;

async function SocialProofStrip() {
  const stats = await getGlobalClimbStats().catch(() => null);

  return (
    <div className="border-y border-border-subtle bg-surface/40 py-3">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-secondary text-center flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" aria-hidden="true" />
        {stats && stats.climberCount > 0 ? (
          <>
            <span className="font-bold text-signal tabular-nums">
              {stats.climberCount}
            </span>
            {" climbers · free duels always on"}
          </>
        ) : (
          "Free duels always on"
        )}
      </p>
    </div>
  );
}

export default async function HomePage() {
  const [climbStats, chipStats] = await Promise.all([
    getGlobalClimbStats().catch(() => ({ climberCount: 0, topPeak: null })),
    getChipDuelStats().catch(() => ({ totalDuels: 0, topEarner: null })),
  ]);

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
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), videoGameJsonLd(), faqJsonLd]} />
      <Navbar />

      <Hero
        stats={{
          climberCount: climbStats.climberCount,
          topPeak: climbStats.topPeak,
          rankedDuels: chipStats.totalDuels,
          topEarner: chipStats.topEarner,
        }}
      />

      <Suspense
        fallback={
          <div className="border-y border-border-subtle bg-surface/40 py-3">
            <div className="h-4 bg-border-subtle rounded-sm w-48 mx-auto animate-pulse" />
          </div>
        }
      >
        <SocialProofStrip />
      </Suspense>

      <DuelPromo />

      <RankedLeaderboard />

      <FreeLeaderboard />

      <AboutDoomstack />

      <Faq />
    </main>
  );
}
