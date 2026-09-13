import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface DashboardData {
  user: { id: string; email: string; username: string | null };
  freeClimb: { peakY: number; rank: number; totalClimbers: number; wins: number; handle: string } | null;
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous, signOut } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAnonymous) { setLoading(false); return; }
    apiFetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, isAnonymous]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (!user || isAnonymous) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-8 text-center">
        <button onClick={() => navigate("/")} className="absolute left-6 top-14 font-mono text-xs uppercase tracking-widest text-text-muted">←</button>
        <p className="text-text-secondary">Sign in to see your profile and track your climbs.</p>
        <button
          onClick={() => navigate("/signin")}
          className="min-h-[52px] w-full max-w-xs rounded-full bg-signal px-6 font-display text-base font-black uppercase tracking-tight text-void"
        >
          Sign In
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center gap-3 px-5 pb-3 pt-14">
        <button onClick={() => navigate("/")} className="font-mono text-xs uppercase tracking-widest text-text-muted">←</button>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-text-primary">Profile</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {loading ? (
          <div className="flex flex-col gap-3 pt-4">
            <div className="h-24 animate-pulse rounded-2xl bg-surface" />
            <div className="h-16 animate-pulse rounded-2xl bg-surface" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            {/* Identity card */}
            <div className="rounded-2xl bg-surface px-5 py-4">
              <p className="font-display text-xl font-black text-text-primary">
                {data?.freeClimb?.handle ?? data?.user.email ?? "Player"}
              </p>
              {data?.user.username && (
                <p className="font-mono text-xs text-text-muted">@{data.user.username}</p>
              )}
              <p className="mt-1 font-mono text-xs text-text-muted">{data?.user.email}</p>
            </div>

            {/* Climb stats */}
            {data?.freeClimb ? (
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Best Height" value={`${data.freeClimb.peakY.toLocaleString()}m`} accent />
                <StatCard label="Rank" value={`#${data.freeClimb.rank}`} />
                <StatCard label="Wins" value={String(data.freeClimb.wins)} />
              </div>
            ) : (
              <div className="rounded-2xl bg-surface px-5 py-4 text-center text-sm text-text-muted">
                No climbs yet — hit Play to start!
              </div>
            )}

            {/* Actions */}
            <button
              onClick={() => navigate("/settings")}
              className="min-h-[52px] rounded-2xl border border-border-strong bg-surface px-5 text-left font-display text-sm font-bold text-text-primary"
            >
              Edit Profile & Settings →
            </button>

            <button
              onClick={handleSignOut}
              className="mt-4 py-2 font-mono text-xs uppercase tracking-widest text-text-muted underline underline-offset-4"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-4 text-center">
      <p className={`font-display text-2xl font-black ${accent ? "text-signal" : "text-text-primary"}`}>
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">{label}</p>
    </div>
  );
}
