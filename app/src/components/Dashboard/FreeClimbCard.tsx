"use client";

/**
 * FreeClimbCard — dashboard card showing the user's free stack leaderboard position.
 */

import Link from "next/link";
import { formatAltitude } from "../../lib/units";

export interface FreeClimbData {
  peakY: number;
  rank: number;
  totalClimbers: number;
  wins: number;
  handle: string;
}

export function FreeClimbCard({ climb }: { climb: FreeClimbData }) {
  return (
    <section
      aria-label="Free climb rank"
      className="mb-8 relative overflow-hidden rounded-2xl border border-signal/30 bg-surface shadow-signal"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" />
      <div className="relative p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            Free climb · your rank
          </p>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="font-mono text-4xl font-bold text-text-primary tabular-nums">
              #{climb.rank}
            </span>
            <span className="text-sm text-text-muted">
              of {climb.totalClimbers} climbers
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            Best peak:{" "}
            <span className="font-mono font-bold text-text-primary tabular-nums">
              {formatAltitude(climb.peakY, 0)}
            </span>
            {climb.wins > 0 && (
              <span className="text-text-muted"> · {climb.wins} wins</span>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <Link
            href="/play"
            className="inline-flex items-center justify-center rounded-lg bg-signal text-void font-semibold px-5 min-h-[44px] hover:brightness-110 transition"
          >
            Play again
          </Link>
          <Link
            href="/climb"
            className="text-sm text-text-muted hover:text-signal underline underline-offset-4"
          >
            View leaderboard
          </Link>
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
        No record yet on the free leaderboard. Play the endless climb to set your rank.
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
