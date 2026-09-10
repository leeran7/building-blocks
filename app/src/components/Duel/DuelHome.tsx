"use client";

/**
 * /duel home: matchmaking + private challenge + W-L display.
 *
 * Canonical primary action = "Find opponent" (queue up). Creating a private
 * challenge link is a de-emphasized secondary path (one primary per surface,
 * per DESIGN.md). Signed-out users see a SINGLE sign-in gate that replaces the
 * actions entirely — no repeated ask.
 *
 * W-L record shown below when the user is signed in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { shareInvite } from "../../lib/shareInvite";
import { Navbar } from "../Navbar";
import { PaidDuelSection } from "./PaidDuelSection";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";

// ─────────────────────────────── Types ────────────────────────────────────

interface DuelStats {
  wins: number;
  losses: number;
  streak: number;
}

/**
 * Creating a challenge navigates straight into the duel lobby (the canonical
 * home for the invite), so there is no post-create "here is your link" state —
 * only the in-flight, already-have-one, and failure cases live here.
 */
type CreateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "existing"; existingId: string }
  | { status: "error"; message: string };

type QueueState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "timeout" }
  | { status: "error"; message: string };

// ─────────────────────────────── Component ────────────────────────────────

export function DuelHome() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [queueState, setQueueState] = useState<QueueState>({ status: "idle" });
  const [stats, setStats] = useState<DuelStats | null>(null);

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
      // Offer the native share sheet right away — we're still inside the click's
      // transient activation (the POST above is fast), which navigator.share
      // requires. Best-effort only: if the window has lapsed or sharing isn't
      // available, the lobby's "Share invite" button is the guaranteed path.
      await shareInvite(body.link).catch(() => {});
      // Seamless: drop the creator straight into the waiting lobby (where they
      // can share the invite and warm up) instead of a static copy screen.
      router.push(`/duel/${body.id}`);
    } catch {
      setCreateState({ status: "error", message: "Network error. Please try again." });
    }
  }, [token, router]);

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

  // ─────────────── Queue ───────────────

  const handleSearch = useCallback(async () => {
    if (!token) return;
    setQueueState({ status: "searching" });

    // Poll the read-only status endpoint every 2s (GET, not a re-POST:
    // re-joining would blow the join rate limit and re-enqueue us). The queue
    // has a TTL server-side; once it lapses the endpoint returns `expired`, so
    // we surface a "timed out" state instead of spinning forever.
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
            return;
          }
          if (pollBody.status === "expired") {
            // TTL lapsed with no match — stop polling and offer a retry rather
            // than leaving the spinner running indefinitely.
            if (pollRef.current) clearInterval(pollRef.current);
            setQueueState({ status: "timeout" });
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
      if (body.status === "expired") {
        setQueueState({ status: "timeout" });
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
      <Navbar contextLabel="1v1" />
      {/* Header */}
      <div className="px-4 pt-8 pb-8 text-center">
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
        {/* Single sign-in gate: signed-out users get ONE ask that stands in for
            every action, rather than the same prompt repeated per section. */}
        {!user && (
          <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
            <p className="text-text-secondary text-sm mb-4">
              Sign in to get matched, challenge a friend, and save your record.
            </p>
            <a
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
            >
              Sign in to play
            </a>
          </section>
        )}

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

        {/* Paid stakes — leads when flag is on; free actions follow below. */}
        {user && PAID_DUELS_ENABLED_PUBLIC && <PaidDuelSection />}

        {/* ── Canonical primary action: Find opponent (matchmaking queue). One
              primary CTA per surface; the private-challenge path below is a
              de-emphasized secondary. Rendered only when signed in — the gate
              above stands in otherwise. ── */}
        {user && (
          <section id="free-duel" className="bg-surface rounded-xl border border-border-subtle p-6 scroll-mt-20">
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
              Find opponent
            </h2>
            <p className="text-text-secondary text-sm mb-5">
              Get matched with a random player and race up the same tower.
            </p>

            {queueState.status === "idle" && (
              <button
                onClick={handleSearch}
                className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
              >
                Find match
              </button>
            )}

            {queueState.status === "searching" && (
              <div className="flex flex-col gap-3" aria-live="polite">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
                    aria-hidden="true"
                  />
                  Searching for an opponent…
                </div>
                <button
                  onClick={handleCancelSearch}
                  className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-ember/50 transition-colors w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Cancel
                </button>
              </div>
            )}

            {queueState.status === "timeout" && (
              <div className="flex flex-col gap-3" role="status">
                <p className="text-text-secondary text-sm">
                  Search timed out — no opponent found. Try again.
                </p>
                <button
                  onClick={handleSearch}
                  className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Search again
                </button>
              </div>
            )}

            {queueState.status === "error" && (
              <div className="flex flex-col gap-2" role="alert">
                <p className="text-ember text-sm">{queueState.message}</p>
                <button
                  onClick={() => setQueueState({ status: "idle" })}
                  className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Try again
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Secondary path: challenge a friend by private link. De-emphasized
              (ghost/border affordances, no bg-signal primary) so the surface has
              a single canonical primary above. ── */}
        {user && (
          <section className="bg-surface-raised rounded-xl border border-border-subtle p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
              Challenge a friend
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              Prefer a specific opponent? Create a private challenge link to share.
            </p>

            {createState.status === "idle" && (
              <button
                onClick={handleCreate}
                className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong bg-surface/60 text-text-secondary text-sm hover:border-signal/50 hover:text-text-primary active:scale-[0.98] transition-[color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
              >
                Create challenge link
              </button>
            )}

            {createState.status === "loading" && (
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <span
                  className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
                  aria-hidden="true"
                />
                Creating…
              </div>
            )}

            {createState.status === "existing" && (
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

            {createState.status === "error" && (
              <div className="flex flex-col gap-2" role="alert">
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
        )}

        {/* Paid stakes section moved above; renders nothing when flag is off. */}
      </div>
    </div>
  );
}
