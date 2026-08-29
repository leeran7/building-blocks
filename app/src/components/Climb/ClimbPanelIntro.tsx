/**
 * Climb panel intro — lives below the hairline inside /climb children.
 * Title, CTA, meta, and compact controls used to sit in the tab band and made
 * the hairline jump when switching to /play.
 */

import Link from "next/link";
import { ClimbControlsGuide } from "../Game/ClimbControlsGuide";

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
