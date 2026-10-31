/**
 * Shared leaderboard table for 1v1 duels — free (overall W-L) and chip (chip W-L).
 * Rows match the Solo board's (ClimbLeaderboard): same row, badge, "You" mark
 * and bar column, so the Solo | 1v1 switch only changes the numbers.
 */

import type { DuelStatsRow } from "../../db/duel";
import { formatChipCents } from "../../config/chipPackages";

/** A free-board row with its place on the whole board (a search keeps it). */
export type RankedDuelRow = DuelStatsRow & { rank: number };

/** DOM id of the viewer's row on the free 1v1 board. */
export const YOUR_DUEL_ROW_ID = "your-duel-row";

// ─────────────── Free leaderboard ──────────────────────────────────────────

export function FreeDuelLeaderboard({
  entries,
  unavailable = false,
  highlightUserId = null,
}: {
  entries: RankedDuelRow[];
  unavailable?: boolean;
  /** The signed-in viewer, when their row is on this board. */
  highlightUserId?: string | null;
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
      {entries.map((e) => {
        const isFirst = e.rank === 1;
        const isYou = highlightUserId !== null && e.userId === highlightUserId;
        const lit = isFirst || isYou;
        const pct = Math.max(4, Math.round((e.wins / top) * 100));
        return (
          <li
            key={e.userId}
            id={isYou ? YOUR_DUEL_ROW_ID : undefined}
            className={
              "relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[52px] flex items-center scroll-mt-20 " +
              (isYou
                ? "border-signal/60 bg-accent/10 shadow-signal"
                : isFirst
                  ? "border-signal/50 bg-accent/6 shadow-signal"
                  : "border-border-subtle bg-surface/40")
            }
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                background: lit
                  ? "linear-gradient(90deg, rgb(203 242 77 / 0.20), transparent)"
                  : "linear-gradient(90deg, rgb(203 242 77 / 0.10), transparent)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3 w-full">
              <RankBadge rank={e.rank} lit={lit} />
              <span className="flex-1 truncate text-text-primary font-medium">
                {e.displayName ?? "—"}
              </span>
              {isYou && (
                <span className="shrink-0 rounded-full bg-signal px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-void">
                  You
                </span>
              )}
              <span className="font-mono text-xs text-text-muted tabular-nums whitespace-nowrap">
                {e.wins}W&nbsp;{e.losses}L
              </span>
              <WinBar pct={pct} lit={lit} />
              <span
                className={
                  "font-mono tabular-nums font-bold text-sm " +
                  (lit ? "text-signal" : "text-text-primary")
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

// ─────────────── Chip leaderboard ─────────────────────────────────────────

export interface ChipLeaderboardEntry {
  userId: string;
  displayName: string | null;
  chipWins: number;
  chipLosses: number;
  netChips: number;
}

export function ChipDuelLeaderboard({
  entries,
  unavailable = false,
}: {
  entries: ChipLeaderboardEntry[];
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <LeaderboardUnavailable label="chip duel standings unavailable" />;
  }

  if (entries.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" aria-hidden="true" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ no chip matches yet ]
        </p>
        <p className="relative text-text-secondary text-sm mt-3">
          First chip duel to finish will claim the top spot.
        </p>
      </div>
    );
  }

  const top = Math.max(1, entries[0].chipWins);

  return (
    <ol className="flex flex-col gap-1.5" aria-label="Chip duel leaderboard">
      {entries.map((e, i) => {
        const rank = i + 1;
        const isFirst = rank === 1;
        const pct = Math.max(4, Math.round((e.chipWins / top) * 100));
        return (
          <li
            key={e.userId}
            className={
              "relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[52px] flex items-center " +
              (isFirst
                ? "border-signal/50 bg-accent/6 shadow-signal"
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
                {e.chipWins}W&nbsp;{e.chipLosses}L
              </span>
              <WinBar pct={pct} lit={isFirst} />
              <span
                className={
                  "font-mono tabular-nums font-bold text-sm " +
                  (e.netChips > 0 ? "text-signal" : e.netChips < 0 ? "text-ember" : "text-text-primary")
                }
              >
                {e.netChips > 0 ? "+" : ""}{formatChipCents(e.netChips)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────── Shared helpers ─────────────────────────────────────────────

/** Wins against the top row: the Solo board's bar column, from sm up. */
function WinBar({ pct, lit }: { pct: number; lit: boolean }) {
  return (
    <span
      className="hidden sm:block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-elevated"
      aria-hidden="true"
    >
      <span
        className="block h-full rounded-full bg-signal"
        style={{ width: `${pct}%`, opacity: lit ? 1 : 0.55 }}
      />
    </span>
  );
}

function RankBadge({ rank, lit = rank === 1 }: { rank: number; lit?: boolean }) {
  return (
    <span
      className={
        "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold tabular-nums " +
        (lit
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
