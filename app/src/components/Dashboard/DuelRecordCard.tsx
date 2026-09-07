"use client";

/**
 * DuelRecordCard — dashboard card showing the user's 1v1 duel win-loss record.
 *
 * Mirrors FreeClimbCard: a per-player record surfaced above the paid-blocks grid.
 * Shows wins–losses plus current/best streak. No public leaderboard — this is the
 * player's own record only.
 */

import Link from "next/link";

/** Serialized duel stats as returned in the /api/dashboard payload. */
export interface DuelRecordData {
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
}

export function DuelRecordCard({ record }: { record: DuelRecordData }) {
  const total = record.wins + record.losses;
  const winPct = total > 0 ? Math.round((record.wins / total) * 100) : 0;

  return (
    <section
      aria-label="1v1 duel record"
      className="mb-8 relative overflow-hidden rounded-2xl border border-signal/30 bg-surface shadow-signal"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" />
      <div className="relative p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            1v1 duels · your record
          </p>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="font-mono text-4xl font-bold text-text-primary tabular-nums">
              {record.wins}&ndash;{record.losses}
            </span>
            {total > 0 && (
              <span className="text-sm text-text-secondary tabular-nums">
                {winPct}% win rate
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-2">
            Current streak:{" "}
            <span className="font-mono font-bold text-text-primary tabular-nums">
              {record.current_streak}
            </span>
            {record.best_streak > 0 && (
              <span className="text-text-secondary">
                {" "}
                · best {record.best_streak}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <Link
            href="/duel"
            className="inline-flex items-center justify-center rounded-lg bg-signal text-void font-semibold px-5 min-h-[44px] hover:brightness-110 transition"
          >
            Play a duel
          </Link>
        </div>
      </div>
    </section>
  );
}

export function DuelRecordEmpty() {
  return (
    <section
      aria-label="1v1 duel"
      className="mb-8 rounded-2xl border border-border-subtle bg-surface p-6 text-center"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        1v1 duels
      </p>
      <p className="text-text-secondary text-sm mt-2 max-w-sm mx-auto">
        No duels yet. Challenge a friend or find a random opponent to start your
        win-loss record.
      </p>
      <Link
        href="/duel"
        className="mt-4 inline-flex items-center justify-center rounded-lg border border-border-strong px-5 min-h-[44px] text-sm font-semibold text-text-primary hover:border-signal/50 transition"
      >
        Start a duel
      </Link>
    </section>
  );
}
