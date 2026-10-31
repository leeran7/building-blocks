/**
 * FreeStackShell — shared frame for the standalone free climb stack
 * (/climb leaderboard, /play, /daily).
 *
 * The site Navbar and a tab-only header band (Leaderboard / Play / Daily)
 * render on every section. On a touch screen the game sections drop the Navbar
 * so it never paints over ClimbScene's `fixed inset-0` fullscreen HUD.
 */

import { ViewTransition, type ReactNode } from "react";
import { Navbar } from "./Navbar";
import { NavTab } from "./ui/NavTab";
import { FREE_CLIMB_HREF, DAILY_HREF } from "./navLinks";

export function FreeStackShell({
  section,
  title,
  children,
}: {
  section: FreeStackSection;
  title: string;
  children: ReactNode;
}) {
  // Both Play and Daily render the full-bleed ClimbScene stage, so they share
  // the navbar-hidden / flex-1 game layout; Leaderboard keeps the scrolling panel.
  const gameSection = section === "play" || section === "daily";

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
        <Navbar contextLabel={section === "daily" ? "Daily Climb" : "Endless"} />
      </div>

      <main id="main-content" className="relative flex flex-1 flex-col">
        {/* One container width for the band across every section, so the tabs
            don't shift horizontally when switching Leaderboard / Play / Daily. */}
        <div className="relative z-10 border-b border-border-subtle shrink-0">
          <div className="max-w-5xl mx-auto w-full px-4 py-2">
            {/* The band stays put while the page under it changes, so it gets
                no entrance animation and one shared view-transition name: a tab
                switch crossfades the pill in place (and glides it over to the
                1v1 band, which uses the same name) instead of re-entering. */}
            <StackTabs label="Endless and Daily Climb sections">
              <NavTab
                href="/climb"
                label="Leaderboard"
                active={section === "leaderboard"}
              />
              <NavTab href={FREE_CLIMB_HREF} label="Play" active={section === "play"} />
              <NavTab href={DAILY_HREF} label="Daily" active={section === "daily"} />
            </StackTabs>
          </div>
        </div>

        {gameSection ? (
          // Do NOT put climb-reveal (transform animation) on this wrapper —
          // ClimbScene is `fixed inset-0` on touch, and a transformed ancestor
          // becomes its containing block, breaking mobile fullscreen layout.
          <div className="relative z-10 w-full flex-1 px-2 pt-2 pb-[max(0px,env(safe-area-inset-bottom))]">
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

export type FreeStackSection = "leaderboard" | "play" | "daily";

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
