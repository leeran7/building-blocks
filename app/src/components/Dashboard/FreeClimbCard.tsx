"use client";

/**
 * FreeClimbCard — dashboard card showing the user's free stack board positions.
 * Mobile is listed first when both exist.
 */

import Link from "next/link";
import {
  CLIMB_BOARD_LABELS,
  climbBoardPath,
  type ClimbBoard,
} from "../../game/climbBoard";

export interface FreeClimbBoardStanding {
  board: ClimbBoard;
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
}

export interface FreeClimbData {
  handle: string;
  boards: FreeClimbBoardStanding[];
}

export function FreeClimbCard({ climb }: { climb: FreeClimbData }) {
  const featured = climb.boards[0];

  return (
    <section
      aria-label="Free climb rank"
      className="mb-8 relative overflow-hidden rounded-2xl border border-signal/30 bg-surface shadow-signal"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" />
      <div className="relative p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            Free climb · your ranks
          </p>
          <ul className="mt-3 space-y-2">
            {climb.boards.map((b) => (
              <li key={b.board} className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted shrink-0">
                  {CLIMB_BOARD_LABELS[b.board]}
                </span>
                <span className="font-mono text-2xl font-bold text-text-primary tabular-nums">
                  #{b.rank}
                </span>
                <span className="text-sm text-text-muted">
                  of {b.totalClimbers} ·{" "}
                  <span className="font-mono font-bold text-text-primary tabular-nums">
                    {b.peakY.toFixed(0)}m
                  </span>
                  {b.wins > 0 ? ` · ${b.wins} wins` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <Link
            href="/play"
            className="inline-flex items-center justify-center rounded-lg bg-signal text-void font-semibold px-5 min-h-[44px] hover:brightness-110 transition"
          >
            Play again
          </Link>
          {featured ? (
            <Link
              href={climbBoardPath(featured.board)}
              className="text-sm text-text-muted hover:text-signal underline underline-offset-4"
            >
              View leaderboard
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function FreeClimbEmpty() {
  return (
    <section
      aria-label="Free climb"
      className="mb-8 rounded-2xl border border-border-subtle bg-surface p-6 text-center"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        Free climb
      </p>
      <p className="text-text-secondary text-sm mt-2 max-w-sm mx-auto">
        No record yet on the free leaderboard. Play the endless climb to set your
        rank — mobile and desktop are ranked separately.
      </p>
      <Link
        href="/play"
        className="mt-4 inline-flex items-center justify-center rounded-lg border border-border-strong px-5 min-h-[44px] text-sm font-semibold text-text-primary hover:border-signal/50 transition"
      >
        Play free climb
      </Link>
    </section>
  );
}
