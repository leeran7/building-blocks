/**
 * DuelStackShell — shared frame for the 1v1 stack (/duel, /duel/leaderboard).
 *
 * Navbar + a tab-only header band are identical on both routes. The band and
 * the content container are pinned to ONE canonical width (DUEL_STACK_WIDTH) so
 * the tab pills sit at the same horizontal position — and share a left edge with
 * the content — whether you're on Play or Leaderboard. Mirrors FreeStackShell so
 * neither stack's band can drift again: the width lives in a single constant used
 * by both routes. Each page supplies its own vertical rhythm inside `children`.
 */

import type { ReactNode } from "react";
import { Navbar } from "../Navbar";
import { NavTab } from "../ui/NavTab";
import { StackTabs } from "../FreeStackShell";
import { DUEL_HREF, DUEL_LEADERBOARD_HREF } from "../navLinks";
import { GameNotes } from "../Game/GameNotes";
import { DuelAbout } from "./DuelAbout";

/**
 * `chips` is a neutral section: /duel/chips lives inside the duel stack chrome
 * but is not one of the two tabs, so neither pill is active (both render
 * inactive, matching the inline band the lobby used to hand-roll).
 */
export type DuelStackSection = "play" | "leaderboard" | "chips";

/**
 * The one canonical width for the 1v1 band + content on every duel route. The
 * two routes have different ideal content widths (a 2-column grid on /duel, a
 * table on /duel/leaderboard) but the chrome must not move, so both pin to this.
 * It matches FreeStackShell's max-w-5xl, so the tab band also stays put when
 * the leaderboard's Solo / 1v1 switch crosses between the two stacks.
 */
export const DUEL_STACK_WIDTH = "max-w-5xl";

export function DuelStackShell({
  section,
  children,
}: {
  section: DuelStackSection;
  children: ReactNode;
}) {
  return (
    <div className="grain topo min-h-screen bg-void text-text-primary">
      <Navbar contextLabel="1v1" />

      {/* Tab band — pinned to DUEL_STACK_WIDTH so it never shifts between routes.
          Same layout as FreeStackShell's: tabs left, Controls / About right. */}
      <div className="border-b border-border-subtle">
        <div
          className={`${DUEL_STACK_WIDTH} mx-auto w-full px-4 py-2 flex items-center justify-between gap-1 sm:gap-2`}
        >
          <StackTabs label="1v1 sections">
            {/* Order matches the free-climb shell: Leaderboard, then Play. */}
            <NavTab
              href={DUEL_LEADERBOARD_HREF}
              label="Leaderboard"
              active={section === "leaderboard"}
            />
            <NavTab href={DUEL_HREF} label="Play" active={section === "play"} />
          </StackTabs>
          <GameNotes aboutTitle="About 1v1">
            <DuelAbout />
          </GameNotes>
        </div>
      </div>

      <main id="main-content" className={`${DUEL_STACK_WIDTH} mx-auto w-full px-4`}>
        {children}
      </main>
    </div>
  );
}
