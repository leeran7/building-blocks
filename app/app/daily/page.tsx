/**
 * Daily Climb page — /daily
 *
 * The same procedurally-generated tower for every player each calendar day.
 * Reuses the free climb engine with a per-day seed lock; scores feed the single
 * /climb leaderboard. A local streak (localStorage) gives a reason to return.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";
import { Chevron } from "../../src/components/Chevron";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Daily Climb — Doomstack",
  description:
    "One tower, one day, everyone. Climb today's shared tower before the lava catches you, build a daily streak, and rank on the free leaderboard.",
  path: "/daily",
});

export default function DailyPage() {
  return (
    <FreeStackShell section="daily" title="Daily Climb">
      <DailyClimbClient />
      <KeepClimbing />
      <DailyIntro />
    </FreeStackShell>
  );
}

/**
 * Where to go until the next tower. This is the canonical home for both asks
 * on this page — the About prose below links to the leaderboard only, so
 * neither destination is pitched twice (app/DESIGN.md).
 */
function KeepClimbing() {
  return (
    <section
      aria-labelledby="keep-climbing"
      className="mx-auto mt-8 w-full max-w-4xl border-t border-border-subtle pt-6"
    >
      <h2
        id="keep-climbing"
        className="font-display text-2xl md:text-3xl font-bold tracking-tight text-text-primary"
      >
        Keep climbing until it resets.
      </h2>
      <p className="mt-2 max-w-lg text-sm text-text-secondary">
        Today&rsquo;s tower is one seed for everyone. Practice on a fresh random
        tower, or put a friend on the same rise.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/play"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border-strong bg-surface/60 px-6 text-sm font-medium text-text-primary transition-colors hover:border-signal/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Free climb →
        </Link>
        <Link
          href="/duel"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border-strong bg-surface/60 px-6 text-sm font-medium text-text-primary transition-colors hover:border-signal/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Challenge a friend →
        </Link>
      </div>
    </section>
  );
}

/**
 * Collapsed by default (same pattern as /play) so it sits below the canvas
 * instead of competing with it — server-rendered, unique crawlable copy.
 */
function DailyIntro() {
  return (
    <details className="group mx-auto mt-4 max-w-2xl rounded-xl border border-border-subtle bg-surface px-5 py-4 open:border-signal/40">
      <summary className="flex items-center gap-3 cursor-pointer list-none min-h-[44px] text-sm font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1">About the Daily Climb</span>
        <Chevron />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        The Daily Climb gives every player the same procedurally generated tower
        each calendar day — one seed, so it&rsquo;s a fair, shared challenge.
        Climb as high as you can before the rising lava catches you; your peak
        height ranks on the free leaderboard at{" "}
        <Link href="/climb" className="text-signal hover:underline">
          /climb
        </Link>
        . Play it every day to build a streak — miss a day and the streak resets.
        The daily tower rolls over at your local midnight. Prefer an endless run
        on a fresh random tower each time, or a head-to-head race? Both are one
        tap away in &ldquo;Keep climbing until it resets&rdquo; above.
      </p>
    </details>
  );
}
