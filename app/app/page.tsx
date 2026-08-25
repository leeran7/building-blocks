/**
 * Landing page — Tower v2
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
import { CategoryGrid } from "../src/components/LandingPage/CategoryGrid";
import { Footer } from "../src/components/LandingPage/Footer";
import { Faq } from "../src/components/LandingPage/Faq";
import { Navbar } from "../src/components/Navbar";
import { Suspense } from "react";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

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
      <p className="text-sm text-text-muted text-center flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
        {proof ? (
          <>
            <span className="font-mono font-semibold text-text-primary tabular-nums">
              {proof.totalBlocks}
            </span>
            {" blocks live across "}
            <span className="font-mono font-semibold text-text-primary tabular-nums">
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
  return (
    <main className="min-h-screen bg-void">
      <Navbar />

      <Hero />

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

      <CategoryGrid />

      <Faq />

      <Footer />
    </main>
  );
}
