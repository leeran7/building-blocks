import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, API_BASE } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { shareInvite } from "@app/lib/shareInvite";
import { tapLight, tapMedium } from "../lib/haptics";

interface DuelStats {
  wins: number;
  losses: number;
  streak: number;
}

type CreateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type QueueState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "timeout" }
  | { status: "error"; message: string };

type DuelMode = "quick" | "challenge";

export function DuelScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const signedIn = Boolean(user) && !isAnonymous;

  const [mode, setMode] = useState<DuelMode>("quick");
  const [stats, setStats] = useState<DuelStats | null>(null);
  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [queueState, setQueueState] = useState<QueueState>({ status: "idle" });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    apiFetch("/api/duel/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DuelStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, [signedIn]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCreate = useCallback(async () => {
    if (!signedIn) return;
    void tapMedium();
    setCreateState({ status: "loading" });

    try {
      const res = await apiFetch("/api/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      if (res.status === 409) {
        const body = (await res.json()) as { existingId: string };
        const link = `${API_BASE}/duel/${body.existingId}`;
        await shareInvite(link).catch(() => {});
        navigate(`/duel/${body.existingId}`);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setCreateState({
          status: "error",
          message: body.error ?? "Could not create challenge.",
        });
        return;
      }

      const body = (await res.json()) as { id: string; link: string };
      await shareInvite(body.link).catch(() => {});
      navigate(`/duel/${body.id}`);
    } catch {
      setCreateState({ status: "error", message: "Network error. Please try again." });
    }
  }, [signedIn, navigate]);

  const handleSearch = useCallback(async () => {
    if (!signedIn) return;
    void tapMedium();
    setQueueState({ status: "searching" });

    const beginPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await apiFetch("/api/duel/queue");
          if (!pollRes.ok) return;
          const pollBody = (await pollRes.json()) as { status: string; duelId?: string };
          if (pollBody.status === "matched" && pollBody.duelId) {
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "idle" });
            navigate(`/duel/${pollBody.duelId}`);
            return;
          }
          if (pollBody.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "timeout" });
          }
        } catch {
          // Transient — next tick retries.
        }
      }, 2000);
    };

    try {
      const res = await apiFetch("/api/duel/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      if (res.status === 409) {
        beginPolling();
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setQueueState({ status: "error", message: body.error ?? "Could not join queue." });
        return;
      }

      const body = (await res.json()) as { status: string; duelId?: string };
      if (body.status === "matched" && body.duelId) {
        setQueueState({ status: "idle" });
        navigate(`/duel/${body.duelId}`);
        return;
      }
      if (body.status === "expired") {
        setQueueState({ status: "timeout" });
        return;
      }

      beginPolling();
    } catch {
      setQueueState({ status: "error", message: "Network error. Please try again." });
    }
  }, [signedIn, navigate]);

  const handleCancelSearch = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQueueState({ status: "idle" });
    apiFetch("/api/duel/queue", { method: "DELETE" }).catch(() => {});
  }, []);

  return (
    <main className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center gap-3 px-5 pb-3 pt-14">
        <button
          onClick={() => { void tapLight(); navigate("/"); }}
          className="font-mono text-xs uppercase tracking-widest text-text-muted"
        >
          &larr;
        </button>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-text-primary">
          1v1 Arena
        </h1>
        {stats && (
          <div className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums">
            <span className="text-signal">{stats.wins}W</span>
            <span className="text-text-muted">{stats.losses}L</span>
            {stats.streak !== 0 && (
              <span className={stats.streak > 0 ? "text-signal" : "text-ember"}>
                {stats.streak > 0 ? `+${stats.streak}` : stats.streak}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10">
        {!signedIn ? (
          <div className="flex flex-col items-center gap-5 pt-16 text-center">
            <p className="text-sm text-text-secondary">
              Sign in to challenge friends and compete in ranked matches.
            </p>
            <button
              onClick={() => navigate("/signin")}
              className="min-h-[52px] w-full max-w-xs rounded-full bg-signal px-6 font-display text-base font-black uppercase tracking-tight text-void active:scale-95"
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Mode selector */}
            <div className="flex flex-col gap-3 pt-4">
              <ModeCard
                title="Quick Play"
                subtitle="Match a random player, race to the top."
                badge="free"
                selected={mode === "quick"}
                onSelect={() => setMode("quick")}
                icon={<BoltIcon />}
              />
              <ModeCard
                title="Challenge"
                subtitle="Send a private invite link to a friend."
                badge="invite"
                selected={mode === "challenge"}
                onSelect={() => setMode("challenge")}
                icon={<TargetIcon />}
              />
            </div>

            {/* Action panel */}
            <div className="mt-5">
              {mode === "quick" ? (
                <div className="rounded-2xl border border-signal/30 bg-surface p-5 shadow-signal">
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    Find opponent
                  </p>
                  <p className="mb-4 text-sm text-text-secondary">
                    Get matched with a random climber and race up the same tower.
                  </p>

                  {queueState.status === "idle" && (
                    <ActionButton label="Find match" onClick={handleSearch} />
                  )}

                  {queueState.status === "searching" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <Spinner />
                        Searching for an opponent&hellip;
                      </div>
                      <button
                        onClick={handleCancelSearch}
                        className="text-left text-xs text-text-muted underline underline-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {queueState.status === "timeout" && (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-text-secondary">
                        No opponent found. Try again.
                      </p>
                      <ActionButton label="Search again" onClick={handleSearch} />
                    </div>
                  )}

                  {queueState.status === "error" && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-ember">{queueState.message}</p>
                      <button
                        onClick={() => setQueueState({ status: "idle" })}
                        className="text-left text-xs text-text-muted underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-border-subtle bg-surface p-5">
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    Challenge a friend
                  </p>
                  <p className="mb-4 text-sm text-text-secondary">
                    Create a private challenge link and share it.
                  </p>

                  {createState.status === "idle" && (
                    <ActionButton label="Create challenge link" onClick={handleCreate} />
                  )}

                  {createState.status === "loading" && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Spinner />
                      Creating&hellip;
                    </div>
                  )}

                  {createState.status === "error" && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-ember">{createState.message}</p>
                      <button
                        onClick={() => setCreateState({ status: "idle" })}
                        className="text-left text-xs text-text-muted underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-full bg-signal py-4 font-display text-base font-black uppercase tracking-widest text-void transition-transform active:scale-95"
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-signal" />
  );
}

function ModeCard({
  title,
  subtitle,
  badge,
  selected,
  onSelect,
  icon,
}: {
  title: string;
  subtitle: string;
  badge: string;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={() => { void tapLight(); onSelect(); }}
      className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors active:scale-[0.98] ${
        selected
          ? "border-signal/50 bg-surface shadow-signal"
          : "border-border-subtle bg-surface-raised"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
          selected
            ? "border-signal/50 bg-signal/10 text-signal"
            : "border-border-strong text-text-secondary"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display text-base font-bold tracking-tight text-text-primary">
            {title}
          </span>
          <span className="rounded-full bg-void/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {badge}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-text-secondary">{subtitle}</span>
      </span>
    </button>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
