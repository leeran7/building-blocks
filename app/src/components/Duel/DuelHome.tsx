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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

/** The three ways into a match, presented as a gamified mode menu. */
type DuelMode = "quick" | "challenge" | "paid";

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
  const [mode, setMode] = useState<DuelMode>("quick");

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

  const paidEnabled = PAID_DUELS_ENABLED_PUBLIC;
  // Keep the selected mode valid if paid is off (or a signed-out teaser lands on it).
  const activeMode: DuelMode = mode === "paid" && !paidEnabled ? "quick" : mode;

  return (
    <div className="grain topo min-h-screen bg-void text-text-primary">
      <Navbar contextLabel="1v1" />

      {/* Tab band */}
      <div className="border-b border-border-subtle">
        <div className="max-w-2xl mx-auto w-full px-4 py-2">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="1v1 sections"
          >
            {/* Order matches the free-climb shell: Leaderboard, then Play. */}
            <Link
              href="/duel/leaderboard"
              role="tab"
              aria-selected={false}
              className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
            >
              Leaderboard
            </Link>
            <span
              role="tab"
              aria-selected={true}
              aria-current="page"
              className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap bg-signal text-void"
            >
              Play
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-7 pb-16 flex flex-col gap-6">
        {/* Player card: title + live record, the gamified hub header. */}
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1.5">
              multiplayer
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight uppercase text-text-primary leading-none">
              1v1 Arena
            </h1>
          </div>
          {stats && (
            <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              <RecordStat value={stats.wins} label="W" tone="signal" />
              <RecordStat value={stats.losses} label="L" tone="muted" />
              {stats.streak !== 0 && (
                <RecordStat
                  value={stats.streak > 0 ? `+${stats.streak}` : stats.streak}
                  label="streak"
                  tone={stats.streak > 0 ? "signal" : "ember"}
                />
              )}
            </div>
          )}
        </header>

        {/* Mode menu — pick a way into a match, then act in the panel below. */}
        <div
          className="grid gap-3"
          role="tablist"
          aria-label="Duel modes"
        >
          <ModeCard
            icon={<BoltIcon />}
            title="Quick Play"
            subtitle="Match a random climber, race up the same tower."
            badge="free"
            selected={activeMode === "quick"}
            onSelect={() => setMode("quick")}
          />
          <ModeCard
            icon={<TargetIcon />}
            title="Challenge"
            subtitle="Invite a specific opponent with a private link."
            badge="invite"
            selected={activeMode === "challenge"}
            onSelect={() => setMode("challenge")}
          />
          {paidEnabled && (
            <ModeCard
              icon={<CoinsIcon />}
              title="Paid Arena"
              subtitle="Stake credits — winner takes the pot."
              badge="$1–$10"
              badgeTone="signal"
              selected={activeMode === "paid"}
              onSelect={() => setMode("paid")}
            />
          )}
        </div>

        {/* Action panel — the selected mode's flow. Signed-out users get ONE
            sign-in gate here that stands in for every mode. */}
        {!user ? (
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
        ) : activeMode === "quick" ? (
          <section
            id="free-duel"
            role="tabpanel"
            className="bg-surface rounded-xl border border-signal/30 shadow-signal p-6 scroll-mt-20"
          >
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
        ) : activeMode === "challenge" ? (
          <section
            role="tabpanel"
            className="bg-surface rounded-xl border border-border-subtle p-6"
          >
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
              Challenge a friend
            </h2>
            <p className="text-text-secondary text-sm mb-5">
              Create a private challenge link and share it with a specific opponent.
            </p>

            {createState.status === "idle" && (
              <button
                onClick={handleCreate}
                className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
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
        ) : (
          // Paid Arena. Slice 1 reuses the existing staked-challenge surface;
          // Slice 2 replaces this with the per-tier lobby.
          <PaidDuelSection />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Presentational ────────────────────────────────

function RecordStat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone: "signal" | "ember" | "muted";
}) {
  const color =
    tone === "signal" ? "text-signal" : tone === "ember" ? "text-ember" : "text-text-secondary";
  return (
    <div className="text-right leading-none">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-text-muted text-[10px] uppercase tracking-[0.12em] ml-1">{label}</span>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  subtitle,
  badge,
  badgeTone = "muted",
  selected,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone?: "muted" | "signal";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={
        "group flex items-center gap-4 rounded-xl border p-4 text-left transition-[border-color,background-color,transform] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (selected
          ? "border-signal/60 bg-surface shadow-signal"
          : "border-border-subtle bg-surface-raised hover:border-signal/40")
      }
    >
      <span
        className={
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors " +
          (selected
            ? "border-signal/50 bg-signal/10 text-signal"
            : "border-border-strong text-text-secondary group-hover:text-text-primary")
        }
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-text-primary">
            {title}
          </span>
          <span
            className={
              "font-mono text-[10px] uppercase tracking-[0.12em] rounded-full px-2 py-0.5 " +
              (badgeTone === "signal"
                ? "bg-signal/15 text-signal"
                : "bg-void/60 text-text-muted")
            }
          >
            {badge}
          </span>
        </span>
        <span className="block text-sm text-text-secondary mt-0.5 truncate">{subtitle}</span>
      </span>
      <span
        className={
          "shrink-0 text-text-muted transition-transform " +
          (selected ? "translate-x-0.5 text-signal" : "group-hover:translate-x-0.5")
        }
        aria-hidden="true"
      >
        →
      </span>
    </button>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.66 2.7 3 6 3s6-1.34 6-3V7" />
      <path d="M15 12.5c2.5-.2 6-1.2 6-3.5" />
      <path d="M9 15v2c0 1.66 2.7 3 6 3s6-1.34 6-3v-5" />
    </svg>
  );
}
