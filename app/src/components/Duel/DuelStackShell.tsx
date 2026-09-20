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
import { DUEL_HREF, DUEL_LEADERBOARD_HREF } from "../navLinks";

export type DuelStackSection = "play" | "leaderboard";

/**
 * The one canonical width for the 1v1 band + content on every duel route. The
 * two routes have different ideal content widths (a 2-column grid on /duel, a
 * table on /duel/leaderboard) but the chrome must not move, so both pin to this.
 */
export const DUEL_STACK_WIDTH = "max-w-4xl";

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

      {/* Tab band — pinned to DUEL_STACK_WIDTH so it never shifts between routes. */}
      <div className="border-b border-border-subtle">
        <div className={`${DUEL_STACK_WIDTH} mx-auto w-full px-4 py-2`}>
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="1v1 sections"
          >
            {/* Order matches the free-climb shell: Leaderboard, then Play. */}
            <NavTab
              href={DUEL_LEADERBOARD_HREF}
              label="Leaderboard"
              active={section === "leaderboard"}
            />
            <NavTab href={DUEL_HREF} label="Play" active={section === "play"} />
          </div>
        </div>
      </div>

      <div className={`${DUEL_STACK_WIDTH} mx-auto w-full px-4`}>{children}</div>
    </div>
  );
}
