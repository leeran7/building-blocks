/**
 * Landing page — Doomstack hub (ASCENT design).
 *
 * Composition, in DOM order: Navbar → Hero (pitch + CTAs + stat strip, beside
 * the pinned tower you climb by scrolling) → VelocityMarquee →
 * ChooseYourClimb (three mode cards: Solo /play, 1v1 /duel, Daily /daily) →
 * Statement (the rule, lit word by word) → LeaderboardTeaser (top-3 free
 * climbers) → AboutDoomstack (crawlable SEO prose) → Faq → Footer.
 *
 * Motion ("the page is the climb"): the client islands live in
 * src/components/LandingPage/motion, tuned in motion/landingMotion.ts.
 * LavaChase keeps the lava following you below the hero.
 *
 * The landing leads with the climb (plan "Doomstack to 8/10", D1/D2): the
 * Hero's one filled bg-signal CTA points at /play; chip duels and cash
 * tournaments get one plain link with their disclosure, under the free board.
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
import { Statement } from "../src/components/LandingPage/Statement";
import { VelocityMarquee } from "../src/components/LandingPage/motion/VelocityMarquee";
import { LavaChase } from "../src/components/LandingPage/motion/LavaChase";
import { AboutDoomstack } from "../src/components/LandingPage/AboutDoomstack";
import { organizationJsonLd, websiteJsonLd, videoGameJsonLd } from "../src/lib/seo";

// ISR: serve the landing from cache and regenerate at most once per 60s, so the
// highest-traffic page doesn't hit the DB (climb stats) on every request.
export const revalidate = 60;

export default async function HomePage() {
  const climbStats = await getGlobalClimbStats().catch(() => ({ climberCount: 0, topPeak: null }));

  const faqJsonLd = {
    "@type": "FAQPage",
    mainEntity: buildFaqs().map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <div className="grain min-h-screen bg-void">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), videoGameJsonLd(), faqJsonLd]} />
      <LavaChase />
      <Navbar />
      <main id="main-content">

        <Hero
          stats={{ climberCount: climbStats.climberCount, topPeak: climbStats.topPeak }}
        />

        <VelocityMarquee />

        {/* Mode index sits immediately under the hero: headline → CTA →
            "choose your climb" is the whole first-screen story. */}
        <ChooseYourClimb />

        <Statement />

        {/* Top-3 free climbers, plus the one link to the paid modes when on. */}
        <LeaderboardTeaser />

        <AboutDoomstack />

        <Faq />
      </main>
    </div>
  );
}
