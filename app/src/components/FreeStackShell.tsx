/**
 * FreeStackShell — shared frame for the standalone free climb stack (/climb, /play).
 *
 * Navbar + a tab-only header band are identical on both routes. Title, CTA and
 * meta live in the panel below the hairline so switching Leaderboard/Play does
 * not jump the tabs. The play panel scrolls (canvas + controls card); it is not
 * a fill-viewport overflow-hidden stage.
 */

import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { NavTab } from "./ui/NavTab";
import { FREE_CLIMB_HREF } from "./navLinks";

export function FreeStackShell({
  section,
  title,
  children,
}: {
  section: FreeStackSection;
  title: string;
  children: ReactNode;
}) {
  const play = section === "play";

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

      <div className="shrink-0">
        <Navbar contextLabel="Free climb" />
      </div>

      <div className="relative z-10 border-b border-border-subtle shrink-0">
        <div className="max-w-2xl mx-auto w-full px-4 py-2">
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
          </div>
        </div>
      </div>

      {play ? (
        // Do NOT put climb-reveal (transform animation) on this wrapper —
        // ClimbScene is `fixed inset-0` on touch, and a transformed ancestor
        // becomes its containing block, breaking mobile fullscreen layout.
        <div className="relative z-10 w-full flex-1 px-2 pt-2 pb-[max(0px,env(safe-area-inset-bottom))]">
          <h1 className="sr-only">{title}</h1>
          {children}
        </div>
      ) : (
        <div className="climb-reveal relative z-10 max-w-2xl mx-auto w-full px-4 py-6">
          {children}
        </div>
      )}
    </main>
  );
}

export type FreeStackSection = "leaderboard" | "play";
