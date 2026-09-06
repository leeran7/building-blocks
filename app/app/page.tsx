/**
 * Landing page — Doomstack / ASCENT Burial Horizon pass.
 *
 * Section order (AC-7): Navbar → Hero → HowItWorks → TowerDirectory →
 * FreeLeaderboard → Faq → Footer. SocialProof only when live blocks > 0.
 * ISR revalidate=60. No new APIs.
 */

import { Hero } from "../src/components/LandingPage/Hero";
import { HowItWorks } from "../src/components/LandingPage/HowItWorks";
import { TowerDirectory } from "../src/components/LandingPage/TowerDirectory";
import { FreeLeaderboard } from "../src/components/LandingPage/FreeLeaderboard";
import { Footer } from "../src/components/LandingPage/Footer";
import { Faq, buildFaqs } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { JsonLd } from "../src/components/JsonLd";
import { getBlockCountsByCategory } from "../src/db/blocks";
import { GAME_CATEGORIES } from "../src/game/categories";
import { loadConstants } from "../src/engine/constants";
import { organizationJsonLd, websiteJsonLd } from "../src/lib/seo";

export const revalidate = 60;

function SocialProofStrip({
  totalBlocks,
  arenaCount,
}: {
  totalBlocks: number;
  arenaCount: number;
}) {
  return (
    <div className="border-y border-border-subtle bg-surface/40 py-3">
      <p className="flex items-center justify-center gap-2 text-center font-mono text-xs uppercase tracking-[0.14em] text-text-secondary">
        <span
          className="h-1.5 w-1.5 rounded-full bg-signal"
          aria-hidden="true"
        />
        <span className="font-bold tabular-nums text-signal">{totalBlocks}</span>
        {" blocks live across "}
        <span className="font-bold tabular-nums text-signal">{arenaCount}</span>
        {" stacks"}
      </p>
    </div>
  );
}

export default async function HomePage() {
  const [counts, constants] = await Promise.all([
    getBlockCountsByCategory().catch(() => ({}) as Record<string, number>),
    Promise.resolve(loadConstants()),
  ]);

  const totalBlocks = GAME_CATEGORIES.reduce(
    (a, c) => a + (counts[c.slug] ?? 0),
    0
  );

  const faqJsonLd = {
    "@type": "FAQPage",
    mainEntity: buildFaqs(constants.MIN_ENTRY_USD, constants.MIN_SPEND_USD).map(
      (faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })
    ),
  };

  return (
    <main id="main-content" className="grain min-h-screen bg-void">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), faqJsonLd]} />
      <Navbar />

      <Hero
        stats={{
          totalBlocks,
          minEntryUsd: constants.MIN_ENTRY_USD,
        }}
      />

      {totalBlocks > 0 ? (
        <SocialProofStrip
          totalBlocks={totalBlocks}
          arenaCount={GAME_CATEGORIES.length}
        />
      ) : null}

      <HowItWorks
        minEntryUsd={constants.MIN_ENTRY_USD}
        minSpendUsd={constants.MIN_SPEND_USD}
      />

      <TowerDirectory counts={counts} minEntryUsd={constants.MIN_ENTRY_USD} />

      <FreeLeaderboard />

      <Faq
        minEntryUsd={constants.MIN_ENTRY_USD}
        minSpendUsd={constants.MIN_SPEND_USD}
      />

      <Footer />
    </main>
  );
}
