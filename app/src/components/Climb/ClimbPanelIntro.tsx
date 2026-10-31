/**
 * Climb panel intro — lives below the hairline inside /climb children.
 * Title, CTA, meta, and compact controls used to sit in the tab band and made
 * the hairline jump when switching to /play. It is the shared BoardIntro, the
 * same block /duel/leaderboard opens with, so the Solo | 1v1 switch under it
 * stays put; the controls guide moved into "About the free climb".
 */

import Link from "next/link";
import { ClimbControlsGuide } from "../Game/ClimbControlsGuide";
import { Chevron } from "../Chevron";
import { BoardIntro } from "../Leaderboard/BoardChrome";

export function ClimbPanelIntro({ title }: { title: string }) {
  return (
    <BoardIntro eyebrow="Endless · no payment" title={title}>
      One leaderboard for the free game. Climb the endless stack as high as you
      can before the lava catches you — your best height is your rank.
    </BoardIntro>
  );
}

/**
 * Fuller description of the free climb, collapsed by default (same pattern as
 * the landing FAQ's <details>/<summary>) so it doesn't compete with the
 * leaderboard for attention — content is in the DOM either way, so this is
 * unique crawlable copy, not client-only or hidden-from-users text.
 */
export function ClimbAbout() {
  return (
    <details className="group mt-6 rounded-xl border border-border-subtle bg-surface px-5 py-4 open:border-signal/40">
      <summary className="flex items-center gap-3 cursor-pointer list-none min-h-[44px] text-sm font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex-1">About Endless</span>
        <Chevron />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        Endless is Doomstack&rsquo;s skill-based mode: one global leaderboard, no payment
        required. Climb an endless procedurally generated stack — ladders, platforms, and rising
        lava — and try to reach the highest point before the lava catches you. Your best peak
        height is saved as your all-time rank. You can play without an account. Sign in to save
        your peak height permanently and appear on this leaderboard — guests can still play and
        see their run&rsquo;s height, it just won&rsquo;t be recorded. Runs are shareable as
        replays, so you can send a specific climb to a friend and let them watch exactly how you
        reached your peak. Want more? Try{" "}
        <Link href="/duel" className="text-signal underline underline-offset-2 hover:decoration-2">1v1 duels</Link> — play free,
        stake chips in ranked matches, or enter tournaments for cash prizes. See{" "}
        <Link href="/rules" className="text-signal underline underline-offset-2 hover:decoration-2">the rules</Link> for details.
      </p>
      <div className="mt-4">
        <ClimbControlsGuide variant="compact" />
      </div>
    </details>
  );
}
