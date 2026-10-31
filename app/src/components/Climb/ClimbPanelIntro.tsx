/**
 * Climb panel intro — lives below the hairline inside /climb children.
 * Title, CTA, meta, and compact controls used to sit in the tab band and made
 * the hairline jump when switching to /play. It is the shared BoardIntro, the
 * same block /duel/leaderboard opens with, so the Solo | 1v1 switch under it
 * stays put. Controls and the About copy open from the tab band (GameNotes).
 */

import Link from "next/link";
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
 * Fuller description of the free climb, opened from the tab band's About
 * button (GameNotes) so it doesn't compete with the leaderboard — it is in the
 * DOM either way, so this is unique crawlable copy, not client-only text.
 * The controls guide is the band's Controls button, as on /play and /daily.
 */
export function ClimbAbout() {
  return (
    <p className="text-sm leading-relaxed text-text-secondary">
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
  );
}
