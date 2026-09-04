/**
 * Climb panel intro — lives below the hairline inside /climb children.
 * Title, CTA, meta, and compact controls used to sit in the tab band and made
 * the hairline jump when switching to /play.
 */

import Link from "next/link";
import { ClimbControlsGuide } from "../Game/ClimbControlsGuide";
import { Chevron } from "../Chevron";

export function ClimbPanelIntro({ title }: { title: string }) {
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.2em] font-medium text-signal">
        Free stack · no payment
      </p>
      <div className="mt-1 flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
          {title}
        </h1>
        <PlayTheClimbCta />
      </div>
      <p className="mt-3 text-sm text-text-secondary max-w-lg">
        One leaderboard for the free game. Climb the endless stack as high as you
        can before the lava catches you — your best height is your rank.
      </p>
      <div className="mt-4">
        <ClimbControlsGuide variant="compact" />
      </div>
    </header>
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
        <span className="flex-1">About the free climb</span>
        <Chevron />
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">
        The free climb is Doomstack&rsquo;s skill-based mode: one global leaderboard, no payment
        required. Climb an endless procedurally generated stack — ladders, platforms, and rising
        lava — and try to reach the highest point before the lava catches you. Your best peak
        height is saved as your all-time rank; there&rsquo;s no way to buy altitude here, unlike
        the 74 paid stacks. You can play without an account. Sign in to save your peak height
        permanently and appear on this leaderboard — guests can still play and see their run&rsquo;s
        height, it just won&rsquo;t be recorded. Runs are shareable as replays, so you can send a
        specific climb to a friend and let them watch exactly how you reached your peak. If
        you&rsquo;re looking for the money-ranked version — buying altitude, surviving burial, and
        competing for a category&rsquo;s #1 spot — that lives across the 74 paid stacks, not here.
        See <Link href="/rules" className="text-signal hover:underline">the rules</Link> for the
        paid stacks&rsquo; exact growth, burial, and season formulas — the free climb&rsquo;s own
        mechanics (lava speed, ladders, jumps) aren&rsquo;t part of that page.
      </p>
    </details>
  );
}

export function PlayTheClimbCta() {
  return (
    <Link
      href="/play"
      className="inline-flex items-center justify-center rounded-full bg-signal text-void font-semibold px-6 min-h-[44px] shadow-signal hover:brightness-110 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void active:scale-[0.98] transition-[filter,transform] whitespace-nowrap"
    >
      Play the climb
    </Link>
  );
}
