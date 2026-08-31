/**
 * The skill-climb leaderboard (ASCENT): players ranked by best peak height in a
 * category (free, earned by playing the endless climb). Rank 1 gets the signal
 * glow; altitude bars are proportional to the top score. Handles are pseudonyms —
 * emails are never shown.
 */

import type { ReactNode } from "react";
import type { ClimberRank } from "../../db/climb";
import {
  CLIMB_BOARD_LABELS,
  type ClimbBoard,
} from "../../game/climbBoard";

export function ClimbLeaderboard({
  climbers,
  unavailable = false,
  board,
  emptyAction,
}: {
  climbers: ClimberRank[];
  /**
   * True when the standings could not be read. Kept separate from an empty
   * list so a failed query never renders as "nobody has played yet" — which
   * is what a swallowed error used to look like.
   */
  unavailable?: boolean;
  /** Which surface this list is for. Affects empty copy and the accessible name. */
  board?: ClimbBoard;
  /** Empty-board extra control (AC-17 Desktop recovery). Not used when unavailable. */
  emptyAction?: ReactNode;
}) {
  const boardLabel = board ? CLIMB_BOARD_LABELS[board].toLowerCase() : "free stack";

  if (unavailable) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
          [ standings unavailable ]
        </p>
        <p className="relative text-text-secondary text-sm mt-3">
          The leaderboard could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (climbers.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border-strong bg-surface p-10 text-center">
        <div className="pointer-events-none absolute inset-0 survey-grid opacity-50" />
        <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ no climbers yet ]
        </p>
        <p className="relative text-text-secondary text-sm mt-3">
          Be the first to set a height record on the {boardLabel} board.
        </p>
        {emptyAction ? (
          <div className="relative mt-6 flex justify-center">{emptyAction}</div>
        ) : null}
      </div>
    );
  }

  const top = Math.max(1, climbers[0].peakY);

  return (
    <ol
      className="flex flex-col gap-1.5"
      aria-label={
        board
          ? `${CLIMB_BOARD_LABELS[board]} skill climb leaderboard`
          : "Skill climb leaderboard"
      }
    >
      {climbers.map((c) => {
        const pct = Math.max(4, Math.round((c.peakY / top) * 100));
        const isFirst = c.rank === 1;
        return (
          <li
            key={c.userId}
            className={
              "relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[52px] flex items-center " +
              (isFirst
                ? "border-signal/50 bg-accent/[0.06] shadow-signal"
                : "border-border-subtle bg-surface/40")
            }
          >
            {/* Altitude bar. */}
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
              <span
                className={
                  "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold tabular-nums " +
                  (isFirst
                    ? "bg-signal text-void"
                    : "border border-border-strong text-text-secondary")
                }
                aria-label={`Rank ${c.rank}`}
              >
                {c.rank}
              </span>
              <span className="flex-1 truncate text-text-primary font-medium">
                {c.handle}
              </span>
              {c.wins > 0 && (
                <span className="font-mono text-xs text-text-secondary tabular-nums">
                  {c.wins}★
                </span>
              )}
              <span
                className={
                  "font-mono tabular-nums font-bold " +
                  (isFirst ? "text-signal" : "text-text-primary")
                }
              >
                {c.peakY.toFixed(0)}
                <span className="text-text-secondary font-normal">m</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
