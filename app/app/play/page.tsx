/**
 * Free climb play page — /play
 *
 * The standalone free endless climb game. Scores feed the single /climb
 * leaderboard — not any paid category stack.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { FreeStackShell } from "../../src/components/FreeStackShell";
import { ClimbPlayClient } from "../../src/components/Game/ClimbPlayClient";
import { Chevron } from "../../src/components/Chevron";
import { buildMetadata } from "../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Play the Free Climb — Stack",
  description:
    "Endless climb — go as high as you can before the rising lava catches you. Your peak height ranks on the free leaderboard.",
  path: "/play",
});

export default async function FreePlayPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const sp = await searchParams;
  const replayToken = typeof sp.r === "string" && sp.r.length > 0 ? sp.r : null;

  return (
    <FreeStackShell section="play" title="Play the climb">
      <ClimbPlayClient replayToken={replayToken} />
      <PlayIntro />
    </FreeStackShell>
  );
}

/**
 * Collapsed by default (same pattern as the landing FAQ) so it sits below the
 * canvas instead of competing with it — still fully server-rendered, unique
 * crawlable copy, not client-only or hidden-from-users text.
 */
function PlayIntro() {
  return (
    <details className="group mx-auto mt-4 max-w-2xl rounded-xl border border-border-subtle bg-surface px-5 py-4 open:border-signal/40">
      <summary className="flex items-center gap-3 cursor-pointer list-none min-h-[44px] text-sm font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1">About this game</span>
        <Chevron />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        This is Doomstack&rsquo;s free climb — an endless, procedurally generated tower of
        ladders, platforms, and rising lava. Climb as high as you can before the lava catches
        you; there&rsquo;s no timer beyond that. Use the on-screen controls on touch devices or
        the keyboard on desktop to move, climb, and jump. Your height at the moment the lava
        reaches you becomes your score for that run. Sign in to save your best run permanently to
        the free leaderboard at <Link href="/climb" className="text-signal hover:underline">
          /climb
        </Link>{" "}
        — you can also play as a guest, though guest runs aren&rsquo;t recorded. Every run can be
        shared as a replay link so someone else can watch exactly how you climbed. The free climb
        is entirely skill-based: no payment, no altitude to buy, and no way to pay for a better
        rank. That&rsquo;s the paid stacks&rsquo; job — 74 separate category leaderboards where
        players buy altitude and compete to avoid being buried by the rising ground. See{" "}
        <Link href="/rules" className="text-signal hover:underline">the rules</Link> for the paid
        stacks&rsquo; exact growth, burial, and season formulas.
      </p>
    </details>
  );
}
