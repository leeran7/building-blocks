import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ScreenHeader, ScreenBody, ListRow, StateMessage } from "../components/ui";

interface ClimberRank {
  rank: number;
  userId: string;
  handle: string;
  username: string | null;
  peakY: number;
  wins: number;
}

export function LeaderboardScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [climbers, setClimbers] = useState<ClimberRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/api/climb/leaderboard")
      .then((r) => r.json())
      .then((d) => setClimbers(d.climbers ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <ScreenHeader
        eyebrow="global"
        title="Leaderboard"
        onBack={() => navigate("/")}
      />

      <ScreenBody>
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
                      {c.peakY.toLocaleString()}m
                    </span>
                  </ListRow>
                </li>
              );
            })}
          </ol>
        )}
      </ScreenBody>
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
