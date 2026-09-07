"use client";

/**
 * /duel home: create challenge link + random queue + W-L display.
 *
 * Two surfaces:
 *   1. "Challenge a friend" — create a link-based duel; copy to clipboard.
 *   2. "Find opponent" — join the random matchmaking queue; poll for a match.
 *
 * W-L record shown below when the user is signed in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";

// ─────────────────────────────── Types ────────────────────────────────────

interface DuelStats {
  wins: number;
  losses: number;
  streak: number;
}

type CreateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; duelId: string; link: string }
  | { status: "existing"; existingId: string }
  | { status: "error"; message: string };

type QueueState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "error"; message: string };

// ─────────────────────────────── Component ────────────────────────────────

export function DuelHome() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [queueState, setQueueState] = useState<QueueState>({ status: "idle" });
  const [stats, setStats] = useState<DuelStats | null>(null);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch W-L stats on mount when signed in
  useEffect(() => {
    if (!user || !token) return;
    fetch("/api/duel/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DuelStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, [user, token]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─────────────── Create challenge ───────────────

  const handleCreate = useCallback(async () => {
    if (!token) return;
    setCreateState({ status: "loading" });

    try {
      const res = await fetch("/api/duel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      if (res.status === 409) {
        const body = (await res.json()) as { existingId: string };
        setCreateState({ status: "existing", existingId: body.existingId });
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
      setCreateState({ status: "done", duelId: body.id, link: body.link });
    } catch {
      setCreateState({ status: "error", message: "Network error. Please try again." });
    }
  }, [token]);

  const handleCancelExisting = useCallback(
    async (existingId: string) => {
      if (!token) return;
      setCreateState({ status: "loading" });
      try {
        const res = await fetch(`/api/duel/${existingId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setCreateState({
            status: "error",
            message: body.error ?? "Could not cancel the open challenge.",
          });
          return;
        }
        // Cancelled (or already gone) — back to a clean slate so a new
        // challenge can be created.
        setCreateState({ status: "idle" });
      } catch {
        setCreateState({ status: "error", message: "Network error. Please try again." });
      }
    },
    [token]
  );

  const handleCopyLink = useCallback(async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select + copy
    }
  }, []);

  // ─────────────── Queue ───────────────

  const handleSearch = useCallback(async () => {
    if (!token) return;
    setQueueState({ status: "searching" });

    // Poll the read-only status endpoint every 2s (GET, not a re-POST:
    // re-joining would blow the join rate limit and re-enqueue us).
    const beginPolling = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch("/api/duel/queue", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!pollRes.ok) return;
          const pollBody = (await pollRes.json()) as { status: string; duelId?: string };
          if (pollBody.status === "matched" && pollBody.duelId) {
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "idle" });
            router.push(`/duel/${pollBody.duelId}`);
          }
        } catch {
          // Ignore poll errors — the next tick recovers.
        }
      }, 2000);
    };

    try {
      const res = await fetch("/api/duel/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ categorySlug: "tech" }),
      });

      // Already holding a queue slot from a previous search — just resume polling.
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
        router.push(`/duel/${body.duelId}`);
        return;
      }

      // Waiting — start polling for the match.
      beginPolling();
    } catch {
      setQueueState({ status: "error", message: "Network error. Please try again." });
    }
  }, [token, router]);

  const handleCancelSearch = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQueueState({ status: "idle" });
    if (!token) return;
    try {
      await fetch("/api/duel/queue", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort
    }
  }, [token]);

  // ─────────────── Render ───────────────

  return (
    <div className="min-h-screen bg-void text-text-primary">
      {/* Header */}
      <div className="px-4 pt-16 pb-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted mb-3">
          multiplayer
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-black tracking-tight uppercase text-text-primary">
          1v1 Duel
        </h1>
        <p className="mt-4 text-text-secondary text-base max-w-sm mx-auto">
          Race a friend or a random opponent up the same tower. Outclimb the
          rising lava — the last one standing wins.
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 pb-16 flex flex-col gap-6">
        {/* W-L Record */}
        {stats && (
          <div className="bg-surface rounded-xl border border-border-subtle p-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-3">
              Your record
            </p>
            <div className="flex gap-6 font-mono tabular-nums">
              <div>
                <span className="text-2xl font-bold text-signal">{stats.wins}</span>
                <span className="text-text-muted text-xs ml-1">W</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-text-secondary">{stats.losses}</span>
                <span className="text-text-muted text-xs ml-1">L</span>
              </div>
              {stats.streak !== 0 && (
                <div>
                  <span
                    className={`text-2xl font-bold ${stats.streak > 0 ? "text-signal" : "text-ember"}`}
                  >
                    {stats.streak > 0 ? `+${stats.streak}` : stats.streak}
                  </span>
                  <span className="text-text-muted text-xs ml-1">streak</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Challenge a friend */}
        <section className="bg-surface rounded-xl border border-border-subtle p-5">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
            Challenge a friend
          </h2>
          <p className="text-text-secondary text-sm mb-4">
            Create a private challenge link and share it.
          </p>

          {!user && (
            <p className="text-text-muted text-sm">
              <a href="/auth/signin" className="text-signal underline underline-offset-2">
                Sign in
              </a>{" "}
              to create a challenge.
            </p>
          )}

          {user && createState.status === "idle" && (
            <button
              onClick={handleCreate}
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              Create challenge
            </button>
          )}

          {user && createState.status === "loading" && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <span
                className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
                aria-hidden="true"
              />
              Creating…
            </div>
          )}

          {user && createState.status === "done" && (
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs text-text-muted break-all">
                {createState.link}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyLink(createState.link)}
                  className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  onClick={() => setCreateState({ status: "idle" })}
                  className="inline-flex items-center justify-center rounded-full px-4 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
                >
                  New
                </button>
              </div>
            </div>
          )}

          {user && createState.status === "existing" && (
            <div className="flex flex-col gap-2">
              <p className="text-warning text-sm">
                You already have an open challenge. Reopen it, or cancel it to
                create a new one.
              </p>
              <a
                href={`/duel/${createState.existingId}`}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
              >
                Go to existing duel
              </a>
              <button
                onClick={() => handleCancelExisting(createState.existingId)}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-ember/50 transition-colors"
              >
                Cancel challenge
              </button>
              <button
                onClick={() => setCreateState({ status: "idle" })}
                className="text-text-muted text-xs underline underline-offset-2 text-left"
              >
                Dismiss
              </button>
            </div>
          )}

          {user && createState.status === "error" && (
            <div className="flex flex-col gap-2">
              <p className="text-ember text-sm">{createState.message}</p>
              <button
                onClick={() => setCreateState({ status: "idle" })}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </section>

        {/* Find opponent */}
        <section className="bg-surface rounded-xl border border-border-subtle p-5">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
            Find opponent
          </h2>
          <p className="text-text-secondary text-sm mb-4">
            Join the queue and get matched with a random player.
          </p>

          {!user && (
            <p className="text-text-muted text-sm">
              <a href="/auth/signin" className="text-signal underline underline-offset-2">
                Sign in
              </a>{" "}
              to join the queue.
            </p>
          )}

          {user && queueState.status === "idle" && (
            <button
              onClick={handleSearch}
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              Search
            </button>
          )}

          {user && queueState.status === "searching" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <span
                  className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
                  aria-hidden="true"
                />
                Searching…
              </div>
              <button
                onClick={handleCancelSearch}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-ember/50 transition-colors w-fit"
              >
                Cancel
              </button>
            </div>
          )}

          {user && queueState.status === "error" && (
            <div className="flex flex-col gap-2">
              <p className="text-ember text-sm">{queueState.message}</p>
              <button
                onClick={() => setQueueState({ status: "idle" })}
                className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors w-fit"
              >
                Try again
              </button>
            </div>
          )}
        </section>

        {/* Sign-in CTA for anon users */}
        {!user && (
          <p className="text-center text-text-muted text-sm">
            <a href="/auth/signin" className="text-signal underline underline-offset-2">
              Sign in
            </a>{" "}
            to save your record and get matched.
          </p>
        )}
      </div>
    </div>
  );
}
