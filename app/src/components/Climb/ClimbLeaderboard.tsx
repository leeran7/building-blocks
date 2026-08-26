/**
 * The skill-climb leaderboard: players ranked by their best peak height in a
 * category (free, earned by playing the endless climb). Rank 1 is emphasized;
 * altitude bars are proportional to the top score. Handles are pseudonyms —
 * emails are never shown.
 */

import type { ClimberRank } from "../../db/climb";

export function ClimbLeaderboard({ climbers }: { climbers: ClimberRank[] }) {
  if (climbers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-text-primary font-semibold">No climbers yet</p>
        <p className="text-text-secondary text-sm mt-1">
          Be the first to set a height record for this category.
        </p>
      </div>
    );
  }

  const top = Math.max(1, climbers[0].peakY);

  return (
    <ol className="flex flex-col gap-2" aria-label="Skill climb leaderboard">
      {climbers.map((c) => {
        const pct = Math.max(4, Math.round((c.peakY / top) * 100));
        const isFirst = c.rank === 1;
        return (
          <li
            key={c.userId}
            className={
              "relative overflow-hidden rounded-lg border px-4 py-3 " +
              (isFirst
                ? "border-accent/60 bg-accent/10"
                : "border-border bg-surface")
            }
          >
            {/* Altitude bar. */}
            <div
              className="absolute inset-y-0 left-0 bg-accent/10"
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-4">
              <span
                className={
                  "w-8 text-right font-mono tabular-nums " +
                  (isFirst ? "text-accent font-bold" : "text-text-muted")
                }
              >
                {c.rank}
              </span>
              <span className="flex-1 truncate text-text-primary font-medium">
                {c.handle}
              </span>
              {c.wins > 0 && (
                <span className="text-xs text-text-muted font-mono">
                  {c.wins}★
                </span>
              )}
              <span
                className={
                  "font-mono tabular-nums " +
                  (isFirst ? "text-accent font-bold" : "text-text-secondary")
                }
              >
                {c.peakY.toFixed(0)}m
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
