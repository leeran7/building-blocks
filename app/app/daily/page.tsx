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
      <DailyIntro />
    </FreeStackShell>
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
        on a fresh random tower each time? Play the{" "}
        <Link href="/play" className="text-signal hover:underline">
          free climb
        </Link>{" "}
        instead, or challenge someone in{" "}
        <Link href="/duel" className="text-signal hover:underline">
          1v1 duels
        </Link>
        .
      </p>
    </details>
  );
}
