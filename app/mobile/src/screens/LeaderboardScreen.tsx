import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

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
      <header className="flex items-center gap-3 px-5 pb-3 pt-14">
        <button
          onClick={() => navigate("/")}
          className="font-mono text-xs uppercase tracking-widest text-text-muted"
        >
          ←
        </button>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-text-primary">
          Leaderboard
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {loading && (
          <div className="flex flex-col gap-2 pt-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}

        {error && (
          <p className="pt-10 text-center text-sm text-text-muted">
            Couldn&apos;t load the leaderboard. Check your connection.
          </p>
        )}

        {!loading && !error && climbers.length === 0 && (
          <p className="pt-10 text-center text-sm text-text-muted">
            No climbs yet. Be the first!
          </p>
        )}

        {!loading && !error && climbers.length > 0 && (
          <ol className="flex flex-col gap-2 pt-2">
            {climbers.map((c) => {
              const isMe = user?.uid === c.userId;
              return (
                <li
                  key={c.userId}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                    isMe
                      ? "border border-signal/40 bg-signal/10"
                      : "bg-surface"
                  }`}
                >
                  <span
                    className={`w-7 text-right font-mono text-sm font-bold ${
                      c.rank === 1
                        ? "text-signal"
                        : c.rank === 2
                          ? "text-text-secondary"
                          : c.rank === 3
                            ? "text-ember"
                            : "text-text-muted"
                    }`}
                  >
                    {c.rank}
                  </span>
                  <span className="flex-1 truncate font-display text-sm font-bold text-text-primary">
                    {c.handle}
                    {isMe && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-signal">
                        you
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm text-text-secondary">
                    {c.peakY.toLocaleString()}m
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
