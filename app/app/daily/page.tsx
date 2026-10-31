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
import { GameNotes } from "../../src/components/Game/GameNotes";
import { buildMetadata } from "../../src/lib/seo";
import { nextUtcResetAt, utcDayKey } from "../../src/lib/dailyDay";
import { dailySeedConfigured, dailySeedFor } from "../../src/lib/dailySeedServer";
import type { DailyInfo } from "../../src/lib/dailyInfo";

export const metadata: Metadata = buildMetadata({
  title: "Daily Climb — Doomstack",
  description:
    "One tower, one day, everyone. Climb today's shared tower before the lava catches you, build a daily streak, and rank on the free leaderboard.",
  path: "/daily",
});

// Today's tower is read per request (same answer as GET /api/climb/daily), so
// the stage paints with the page instead of after a client fetch.
export const dynamic = "force-dynamic";

/** The live tower by the server clock, or null when the daily is not configured. */
function todaysTower(now: Date): DailyInfo | null {
  if (!dailySeedConfigured()) return null;
  const day = utcDayKey(now);
  return { day, seed: dailySeedFor(day), resetsAt: nextUtcResetAt(now).toISOString() };
}

export default function DailyPage() {
  const now = new Date();
  return (
    <FreeStackShell section="daily" title="Daily Climb" tools={<DailyNotes />}>
      <DailyClimbClient initialDaily={todaysTower(now)} servedAt={now.getTime()} />
      <KeepClimbing />
    </FreeStackShell>
  );
}

/**
 * Where to go until the next tower. This is the canonical home for both asks
 * on this page — the About prose (in the tab band's About dialog) links to
 * the leaderboard only, so neither destination is pitched twice (app/DESIGN.md).
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
          Endless →
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
 * Opens from the tab band (GameNotes, same as /play) so it never competes
 * with the canvas — server-rendered, unique crawlable copy.
 */
function DailyNotes() {
  return (
    <GameNotes aboutTitle="About the Daily Climb">
      <p className="text-sm leading-relaxed text-text-secondary">
        The Daily Climb gives every player the same procedurally generated tower
        each calendar day — one seed, so it&rsquo;s a fair, shared challenge.
        Climb as high as you can before the rising lava catches you; your peak
        height ranks on the free leaderboard at{" "}
        <Link href="/climb" className="text-signal underline underline-offset-2 hover:decoration-2">
          /climb
        </Link>
        . Play it every day to build a streak — miss a day and the streak resets.
        The daily tower rolls over at midnight UTC. Prefer an endless run
        on a fresh random tower each time, or a head-to-head race? Both are one
        tap away in &ldquo;Keep climbing until it resets&rdquo; on this page.
      </p>
    </GameNotes>
  );
}
