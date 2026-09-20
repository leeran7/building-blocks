/**
 * FreeStackShell — shared frame for the standalone free climb stack
 * (/climb leaderboard, /play, /daily).
 *
 * A tab-only header band (Leaderboard / Play / Daily) renders on every section.
 * The Navbar renders ONLY on the leaderboard section: the game sections go
 * navbar-less so the sticky navbar never paints over ClimbScene's touch
 * `fixed inset-0` fullscreen HUD. Trade: on desktop the tab band sits ~56px
 * higher on the game sections than on the leaderboard (intentional per product
 * — a navbar-less game was chosen over a jitter-free tab band).
 */

import type { ReactNode } from "react";
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
    <main
      id="main-content"
      data-climb-chrome
      className="grain topo relative min-h-screen bg-void flex flex-col"
    >
      {/* Climb-scoped burial atmosphere — fork of groundRise; not shared animate-groundRise */}
      <div
        className="ground-gradient animate-climbGroundRise pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-45"
        aria-hidden="true"
      />

      {/* Navbar renders ONLY on the non-game (leaderboard) section. The game
          sections (/play, /daily) go navbar-less: on touch, ClimbScene mounts
          its stage as `fixed inset-0 z-40` inside this shell's `relative z-10`
          game wrapper, which caps that z below the navbar's sibling `sticky
          z-30`, so a rendered navbar paints OVER the top of the fullscreen game
          and covers the HUD ("HEIGHT" / "LAVA CLEARANCE"). Dropping the navbar
          on the game restores the original navbar-less game screens on every
          device. Tradeoff (intentional, per product): on desktop the tab band
          below sits ~56px higher on /play & /daily than on /climb, so it shifts
          vertically when switching between the leaderboard and game tabs. */}
      {!gameSection && (
        <div className="shrink-0">
          <Navbar contextLabel="Free climb" />
        </div>
      )}

      {/* One container width for the band across every section, so the tabs
          don't shift horizontally when switching Leaderboard / Play / Daily. */}
      <div className="relative z-10 border-b border-border-subtle shrink-0">
        <div className="max-w-5xl mx-auto w-full px-4 py-2">
          <div
            className="climb-reveal inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="Free stack sections"
          >
            <NavTab
              href="/climb"
              label="Leaderboard"
              active={section === "leaderboard"}
            />
            <NavTab href={FREE_CLIMB_HREF} label="Play" active={section === "play"} />
            <NavTab href={DAILY_HREF} label="Daily" active={section === "daily"} />
          </div>
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
  );
}

export type FreeStackSection = "leaderboard" | "play" | "daily";
