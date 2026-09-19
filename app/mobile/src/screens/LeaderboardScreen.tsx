import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useLeaderboard } from "../contexts/AppDataContext";
import { ALTITUDE_UNIT } from "@app/lib/units";
import { ScreenHeader, ListRow, StateMessage } from "../components/ui";
import { PullToRefresh } from "../components/PullToRefresh";

export function LeaderboardScreen() {
  const { user } = useAuth();
  const { data, loading: sliceLoading, error, refreshLeaderboard } = useLeaderboard();
  const climbers = data ?? [];
  const loading = sliceLoading && data === null;

  const handleRefresh = useCallback(() => refreshLeaderboard(), [refreshLeaderboard]);

  return (
    <main className="flex h-full flex-col">
      <ScreenHeader eyebrow="global" title="Leaderboard" />

      <PullToRefresh onRefresh={handleRefresh}>
        {loading && (
          <div className="flex flex-col gap-2.5 pt-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-2xl border border-border-subtle bg-surface/60"
              />
            ))}
          </div>
        )}

        {error && (
          <StateMessage>
            Couldn&apos;t load the leaderboard. Check your connection and try
            again.
          </StateMessage>
        )}

        {!loading && !error && climbers.length === 0 && (
          <StateMessage>No climbs yet. Be the first to the top.</StateMessage>
        )}

        {!loading && !error && climbers.length > 0 && (
          <ol className="flex flex-col gap-2.5 pt-1">
            {climbers.map((c) => {
              const isMe = user?.uid === c.userId;
              return (
                <li key={c.userId}>
                  <ListRow highlight={isMe}>
                    <RankBadge rank={c.rank} />
                    <span className="flex-1 truncate font-display text-sm font-bold text-text-primary">
                      {c.handle}
                      {isMe && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
                          you
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-text-secondary">
                      {c.peakY.toLocaleString()}{ALTITUDE_UNIT}
                    </span>
                  </ListRow>
                </li>
              );
            })}
          </ol>
        )}
      </PullToRefresh>
    </main>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? "border-signal/50 bg-signal/15 text-signal"
      : rank === 2
        ? "border-border-strong bg-elevated text-text-secondary"
        : rank === 3
          ? "border-ember/40 bg-ember/10 text-ember"
          : "border-transparent text-text-muted";
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold tabular-nums ${medal}`}
    >
      {rank}
    </span>
  );
}
