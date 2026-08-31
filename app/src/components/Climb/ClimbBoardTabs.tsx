/**
 * Mobile / desktop board switcher for the free-climb leaderboard.
 *
 * `/climb` uses Links so the default board is a clean URL and no-JS still
 * works. The landing teaser uses onSelect so switching tabs does not reload
 * the whole page.
 */

"use client";

import Link from "next/link";
import {
  CLIMB_BOARD_LABELS,
  CLIMB_BOARD_ORDER,
  climbBoardPath,
  type ClimbBoard,
} from "../../game/climbBoard";

export function ClimbBoardTabs({
  active,
  hrefFor,
  onSelect,
}: {
  active: ClimbBoard;
  hrefFor?: (board: ClimbBoard) => string;
  onSelect?: (board: ClimbBoard) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
      role="tablist"
      aria-label="Leaderboard boards"
    >
      {CLIMB_BOARD_ORDER.map((board) => {
        const selected = active === board;
        const className = climbBoardTabClass(selected);
        const label = CLIMB_BOARD_LABELS[board];
        if (onSelect) {
          return (
            <button
              key={board}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(board)}
              className={className}
            >
              {label}
            </button>
          );
        }
        return (
          <Link
            key={board}
            href={(hrefFor ?? climbBoardPath)(board)}
            role="tab"
            aria-selected={selected}
            aria-current={selected ? "page" : undefined}
            className={className}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function climbBoardTabClass(active: boolean): string {
  return (
    "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
    (active
      ? "bg-signal text-void hover:brightness-110"
      : "text-text-secondary hover:text-text-primary")
  );
}
