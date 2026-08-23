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
    <div className="bg-elevated py-4 w-full">
      <p className="text-sm text-text-muted text-center">
        {proof ? (
          <>
            <span className="font-mono text-text-primary">{proof.totalBlocks}</span>
            {" blocks live across "}
            <span className="font-mono text-text-primary">{proof.arenaCount}</span>
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
      {/* Minimal nav */}
      <nav className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-void/80 backdrop-blur border-b border-border-subtle">
        <span className="text-xl font-semibold text-text-primary">Tower</span>
        <div className="flex items-center gap-3">
          <a
            href="/auth/signin"
            className="text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] inline-flex items-center"
          >
            Sign in
          </a>
          <a
            href="/auth/signup"
            className="text-sm font-medium bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary hover:bg-elevated transition-colors min-h-[44px] inline-flex items-center"
          >
            Get started
          </a>
        </div>
      </nav>

      {/* Hero — full-bleed, padded-top for nav */}
      <div className="pt-[56px]">
        <Hero />
      </div>

      {/* Social proof strip */}
      <Suspense
        fallback={
          <div className="bg-elevated py-4">
            <div className="h-4 bg-border-subtle rounded w-48 mx-auto animate-pulse" />
          </div>
        }
      >
        <SocialProofStrip />
      </Suspense>

      {/* How it works */}
      <HowItWorks />

      {/* Category grid */}
      <CategoryGrid />

      {/* Footer */}
      <Footer />
    </main>
  );
}
