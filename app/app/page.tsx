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
import { HowItWorks } from "../src/components/LandingPage/HowItWorks";
import { TowerDirectory } from "../src/components/LandingPage/TowerDirectory";
import { FreeLeaderboard } from "../src/components/LandingPage/FreeLeaderboard";
import { Footer } from "../src/components/LandingPage/Footer";
import { Faq } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { getBlockCountsByCategory } from "../src/db/blocks";
import { getGlobalClimbStats } from "../src/db/climb";
import { GAME_CATEGORIES } from "../src/game/categories";
import { loadConstants } from "../src/engine/constants";
import { Suspense } from "react";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// ISR: serve the landing from cache and regenerate at most once per 60s, so the
// highest-traffic page doesn't hit the DB (block counts + social proof) on every
// request. Live tower data still updates via the polled API on the stack views.
export const revalidate = 60;

async function getSocialProofData(): Promise<{
  totalBlocks: number;
  arenaCount: number;
} | null> {
  try {
    const categories = [
      "tech",
      "design",
      "business",
      "creative",
      "gaming",
      "science",
    ];
    const responses = await Promise.all(
      categories.map((cat) =>
        fetch(`${BASE_URL}/api/tower/${cat}`, {
          next: { revalidate: 60 },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
    const totalBlocks = responses.reduce((acc, data) => {
      if (!data) return acc;
      const visible = (data.blocks ?? []).filter(
        (b: { buried: boolean }) => !b.buried
      );
      return acc + visible.length;
    }, 0);
    return { totalBlocks, arenaCount: 6 };
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
            {" blocks live across "}
            <span className="font-bold text-signal tabular-nums">
              {proof.arenaCount}
            </span>
            {" arenas"}
          </>
        ) : (
          "Join the leaderboard"
        )}
      </p>
    </div>
  );
}

export default async function HomePage() {
  const [counts, climbStats, constants] = await Promise.all([
    getBlockCountsByCategory().catch(() => ({}) as Record<string, number>),
    getGlobalClimbStats().catch(() => ({ climberCount: 0, topPeak: null })),
    Promise.resolve(loadConstants()),
  ]);

  // Real, live figures — count blocks the same way the directory does (over the
  // game-category stacks) so the hero matches what the directory shows.
  const totalBlocks = GAME_CATEGORIES.reduce(
    (a, c) => a + (counts[c.slug] ?? 0),
    0
  );

  return (
    <main className="grain min-h-screen bg-void">
      <Navbar />

      <Hero
        stats={{
          totalBlocks,
          minEntryUsd: constants.MIN_ENTRY_USD,
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

      <HowItWorks />

      <TowerDirectory counts={counts} minEntryUsd={constants.MIN_ENTRY_USD} />

      <FreeLeaderboard />

      <Faq />

      <Footer />
    </main>
  );
}
