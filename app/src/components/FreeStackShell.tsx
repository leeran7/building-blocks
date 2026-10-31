/**
 * FreeStackShell — shared frame for the two solo stacks: Endless (/climb,
 * /play) and Daily Climb (/daily/leaderboard, /daily).
 *
 * The site Navbar marks the mode (Endless or Daily), and the band under it
 * has the same two tabs on every stack, 1v1 included: Leaderboard | Play.
 * On a touch screen the game sections drop the Navbar so it never paints over
 * ClimbScene's `fixed inset-0` fullscreen HUD.
 */

import { ViewTransition, type ReactNode } from "react";
import { Navbar } from "./Navbar";
import { NavTab } from "./ui/NavTab";
import {
  DAILY_HREF,
  DAILY_LEADERBOARD_HREF,
  ENDLESS_LEADERBOARD_HREF,
  FREE_CLIMB_HREF,
} from "./navLinks";

/** Each solo stack's two tabs, in the order the 1v1 band uses. */
const STACKS = {
  endless: {
    navLabel: "Endless",
    tabsLabel: "Endless sections",
    leaderboard: { href: ENDLESS_LEADERBOARD_HREF, section: "leaderboard" },
    play: { href: FREE_CLIMB_HREF, section: "play" },
  },
  daily: {
    navLabel: "Daily Climb",
    tabsLabel: "Daily Climb sections",
    leaderboard: { href: DAILY_LEADERBOARD_HREF, section: "daily-leaderboard" },
    play: { href: DAILY_HREF, section: "daily" },
  },
} as const;

/** The stack a section belongs to. */
export function stackOf(section: FreeStackSection): keyof typeof STACKS {
  return section === "daily" || section === "daily-leaderboard" ? "daily" : "endless";
}

export function FreeStackShell({
  section,
  title,
  tools,
  children,
}: {
  section: FreeStackSection;
  title: string;
  /** Buttons at the right end of the tab band (the game sections' GameNotes). */
  tools?: ReactNode;
  children: ReactNode;
}) {
  // Both Play and Daily render the full-bleed ClimbScene stage, so they share
  // the navbar-hidden / flex-1 game layout; Leaderboard keeps the scrolling panel.
  const gameSection = section === "play" || section === "daily";
  const stack = STACKS[stackOf(section)];

  return (
    <div
      data-climb-chrome
      className="grain topo relative min-h-screen bg-void flex flex-col"
    >
      {/* Climb-scoped burial atmosphere — fork of groundRise; not shared animate-groundRise */}
      <div
        className="ground-gradient animate-climbGroundRise pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-45"
        aria-hidden="true"
      />

      {/* The site header sits outside <main> so it stays the page banner. On a
          touch screen the game sections (/play, /daily) drop it: ClimbScene
          mounts its stage as `fixed inset-0 z-40` inside the game wrapper's
          `relative z-10`, which caps that z below the navbar's sticky z-30, so
          the navbar would paint over the HUD ("HEIGHT" / "LAVA CLEARANCE").
          With a mouse the game stays in the page, so the header stays too.
          pointer-coarse matches useCoarsePointer, which picks the touch layout.
          The wrapper is what sticks (the navbar's own sticky only spans this
          wrapper), so the header stays pinned here like on every other page. */}
      <div
        className={
          gameSection
            ? "sticky top-0 z-30 shrink-0 pointer-coarse:hidden"
            : "sticky top-0 z-30 shrink-0"
        }
      >
        <Navbar contextLabel={stack.navLabel} />
      </div>

      <main id="main-content" className="relative flex flex-1 flex-col">
        {/* One container width for the band across every section, so the tabs
            don't shift horizontally when switching Leaderboard / Play or between stacks. */}
        <div className="relative z-10 border-b border-border-subtle shrink-0">
          <div className="max-w-5xl mx-auto w-full px-4 py-2 flex items-center justify-between gap-1 sm:gap-2">
            {/* The band stays put while the page under it changes, so it gets
                no entrance animation and one shared view-transition name: a tab
                switch crossfades the pill in place (and glides it over to the
                1v1 band, which uses the same name) instead of re-entering. */}
            <StackTabs label={stack.tabsLabel}>
              <NavTab
                href={stack.leaderboard.href}
                label="Leaderboard"
                active={section === stack.leaderboard.section}
              />
              <NavTab href={stack.play.href} label="Play" active={section === stack.play.section} />
            </StackTabs>
            {/* Same 44px height as the tabs, so the band is the same height on
                every section whether or not it has tools. */}
            {tools}
          </div>
        </div>

        {gameSection ? (
          // Do NOT put climb-reveal (transform animation) on this wrapper —
          // ClimbScene is `fixed inset-0` on touch, and a transformed ancestor
          // becomes its containing block, breaking mobile fullscreen layout.
          // With a mouse the page scrolls past the stage, so pb-20 lifts the
          // last block clear of the ground glow at the page edge.
          <div className="relative z-10 w-full flex-1 px-2 pt-2 pb-[max(0px,env(safe-area-inset-bottom))] pointer-fine:pb-20">
            <h1 className="sr-only">{title}</h1>
            {children}
          </div>
        ) : (
          <div className="climb-reveal relative z-10 max-w-5xl mx-auto w-full px-4 py-6">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}

export type FreeStackSection = "leaderboard" | "play" | "daily" | "daily-leaderboard";

/**
 * The pill tablist both stack shells share. `stack-tabs` is its
 * view-transition name (styled in globals.css); `default="none"` keeps it out of
 * every transition except the one between two pages that both render it.
 */
export function StackTabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ViewTransition name="stack-tabs" share="auto" default="none">
      <div
        className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
        role="tablist"
        aria-label={label}
      >
        {children}
      </div>
    </ViewTransition>
  );
}
