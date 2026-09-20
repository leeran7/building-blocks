/**
 * Landing page — Doomstack hub (ASCENT design).
 *
 * Composition, in DOM order: Navbar → Hero (pitch + CTAs + stat strip) →
 * ChooseYourClimb (three mode cards: Solo /play, 1v1 /duel, Daily /daily) →
 * LeaderboardTeaser (merged top-3 free + top-3 ranked-when-paid) →
 * AboutDoomstack (crawlable SEO prose) → Faq → Footer.
 *
 * CTA invariant (app/DESIGN.md, "Calls to action"): exactly one filled
 * bg-signal CTA points at /duel (the Hero primary) and zero filled bg-signal
 * CTAs point at /play across the whole landing.
 *
 * SEO: organization / website / VideoGame / FAQPage JSON-LD are emitted from
 * this server component; the FAQPage node is generated from buildFaqs() so it
 * always matches the rendered <Faq />. Background #0a0a0c is set on <body> in
 * layout.tsx. Renders under ISR (revalidate below) — do not flip to dynamic.
 */

import { Hero } from "../src/components/LandingPage/Hero";
import { ChooseYourClimb } from "../src/components/LandingPage/ChooseYourClimb";
import { LeaderboardTeaser } from "../src/components/LandingPage/LeaderboardTeaser";
import { Faq, buildFaqs } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { JsonLd } from "../src/components/JsonLd";
import { getGlobalClimbStats } from "../src/db/climb";
import { getChipDuelStats } from "../src/db/chips";
import { AboutDoomstack } from "../src/components/LandingPage/AboutDoomstack";
import { organizationJsonLd, websiteJsonLd, videoGameJsonLd } from "../src/lib/seo";

// ISR: serve the landing from cache and regenerate at most once per 60s, so the
// highest-traffic page doesn't hit the DB (climb stats) on every request.
export const revalidate = 60;

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

      {/* Mode index sits immediately under the hero: headline → CTA →
          "choose your climb" is the whole first-screen story. */}
      <ChooseYourClimb />

      {/* Merged leaderboard block: top-3 free (+ top-3 ranked when paid duels
          are on). Both boards keep their own server reads + empty states. */}
      <LeaderboardTeaser />

      <AboutDoomstack />

      <Faq />
    </main>
  );
}
