/**
 * Shared leaderboard table for 1v1 duels — free (overall W-L) and paid (paid-only W-L + earnings).
 */

import type { DuelStatsRow, PaidDuelStatsRow } from "../../db/duel";

// ─────────────── Free leaderboard ──────────────────────────────────────────

export function FreeDuelLeaderboard({
  entries,
  unavailable = false,
}: {
  entries: DuelStatsRow[];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <LeaderboardUnavailable label="duel standings unavailable" />;
  }

  if (entries.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" aria-hidden="true" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ no matches yet ]
        </p>
        <p className="relative text-text-secondary text-sm mt-3">
          Be the first to finish a 1v1 match and claim a rank.
        </p>
      </div>
    );
  }

  const top = Math.max(1, entries[0].wins);

  return (
    <ol className="flex flex-col gap-1.5" aria-label="Free 1v1 leaderboard">
      {entries.map((e, i) => {
        const rank = i + 1;
        const isFirst = rank === 1;
        const pct = Math.max(4, Math.round((e.wins / top) * 100));
        return (
          <li
            key={e.userId}
            className={
              "relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[52px] flex items-center " +
              (isFirst
                ? "border-signal/50 bg-accent/[0.06] shadow-signal"
                : "border-border-subtle bg-surface/40")
            }
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                background: isFirst
                  ? "linear-gradient(90deg, rgb(203 242 77 / 0.20), transparent)"
                  : "linear-gradient(90deg, rgb(203 242 77 / 0.10), transparent)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3 w-full">
              <RankBadge rank={rank} />
              <span className="flex-1 truncate text-text-primary font-medium">
                {e.displayName ?? "—"}
              </span>
              <span className="font-mono text-xs text-text-muted tabular-nums whitespace-nowrap">
                {e.wins}W&nbsp;{e.losses}L
              </span>
              <span
                className={
                  "font-mono tabular-nums font-bold text-sm " +
                  (isFirst ? "text-signal" : "text-text-primary")
                }
              >
                {e.winPct}
                <span className="text-text-secondary font-normal text-xs">%</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────── Paid leaderboard ──────────────────────────────────────────

export function PaidDuelLeaderboard({
  entries,
  unavailable = false,
}: {
  entries: PaidDuelStatsRow[];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <LeaderboardUnavailable label="paid duel standings unavailable" />;
  }

  if (entries.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" aria-hidden="true" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ no paid matches yet ]
        </p>
        <p className="relative text-text-secondary text-sm mt-3">
          First paid duel to finish will claim the top spot.
        </p>
      </div>
    );
  }

  const top = Math.max(1, entries[0].paidWins);

  return (
    <ol className="flex flex-col gap-1.5" aria-label="Paid 1v1 leaderboard">
      {entries.map((e, i) => {
        const rank = i + 1;
        const isFirst = rank === 1;
        const pct = Math.max(4, Math.round((e.paidWins / top) * 100));
        const earned = (e.totalPayoutCents / 100).toFixed(2);
        return (
          <li
            key={e.userId}
            className={
              "relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[52px] flex items-center " +
              (isFirst
                ? "border-signal/50 bg-accent/[0.06] shadow-signal"
                : "border-border-subtle bg-surface/40")
            }
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                background: isFirst
                  ? "linear-gradient(90deg, rgb(203 242 77 / 0.20), transparent)"
                  : "linear-gradient(90deg, rgb(203 242 77 / 0.10), transparent)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3 w-full">
              <RankBadge rank={rank} />
              <span className="flex-1 truncate text-text-primary font-medium">
                {e.displayName ?? "—"}
              </span>
              <span className="font-mono text-xs text-text-muted tabular-nums whitespace-nowrap">
                {e.paidWins}W&nbsp;{e.paidLosses}L
              </span>
              <span
                className={
                  "font-mono tabular-nums font-bold text-sm " +
                  (isFirst ? "text-signal" : "text-text-primary")
                }
              >
                ${earned}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────── Shared helpers ─────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold tabular-nums " +
        (rank === 1
          ? "bg-signal text-void"
          : "border border-border-strong text-text-secondary")
      }
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

function LeaderboardUnavailable({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" aria-hidden="true" />
      <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
        [ {label} ]
      </p>
      <p className="relative text-text-secondary text-sm mt-3">
        Could not load standings. Try again in a moment.
      </p>
    </div>
  );
}
