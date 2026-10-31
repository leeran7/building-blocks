/**
 * Daily Climb page — /daily
 *
 * The same procedurally-generated tower for every player each calendar day.
 * Reuses the free climb engine with a per-day seed lock; scores feed today's
 * board (/daily/leaderboard) and the all-time /climb board. A local streak (localStorage) gives a reason to return.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { DailyClimbClient } from "../../src/components/Game/DailyClimbClient";
import { GameNotes } from "../../src/components/Game/GameNotes";
import {
  DailyTodayLabel,
  DailyTodayPanel,
  DailyTodayProvider,
} from "../../src/components/Game/DailyToday";
import { DailyAbout } from "../../src/components/Daily/DailyAbout";
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
    // The provider spans the band and the stage: DailyClimbClient publishes
    // the streak and countdown, the band's Today's tower button shows them.
    <DailyTodayProvider>
      <FreeStackShell section="daily" title="Daily Climb" tools={<DailyNotes />}>
        <DailyClimbClient initialDaily={todaysTower(now)} servedAt={now.getTime()} />
      </FreeStackShell>
    </DailyTodayProvider>
  );
}

/**
 * Where to go until the next tower, at the foot of the Today's tower dialog.
 * This is the canonical home for both asks on this page — the About prose
 * links to the leaderboard only, so neither destination is pitched twice
 * (app/DESIGN.md). No id: the dialog renders twice (wide and narrow band).
 */
function KeepClimbing() {
  return (
    <section className="w-full border-t border-border-subtle pt-4">
      <h3 className="font-display text-xl font-bold tracking-tight text-text-primary">
        Keep climbing until it resets.
      </h3>
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
    <GameNotes
      stack="Daily Climb"
      aboutTitle="About the Daily Climb"
      today={{
        text: <DailyTodayLabel />,
        content: (
          <DailyTodayPanel>
            <KeepClimbing />
          </DailyTodayPanel>
        ),
      }}
    >
      <DailyAbout />
    </GameNotes>
  );
}
