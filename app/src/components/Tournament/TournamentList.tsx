"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { Navbar } from "../Navbar";
import { CHIP_TIERS } from "../../db/chips";

interface QueueInfo {
  entryFeeCents: number;
  entrantCount: number;
  bracketSize: number;
  tournamentId: string;
}

type JoinState =
  | { status: "idle" }
  | { status: "joining" }
  | { status: "queued"; entrantCount: number; bracketSize: number; tournamentId: string }
  | { status: "error"; message: string };

export function TournamentList() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState<number>(CHIP_TIERS[0]);
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [joinState, setJoinState] = useState<JoinState>({ status: "idle" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tournaments/queue")
      .then((r) => (r.ok ? r.json() : { queues: [] }))
      .then((data) => setQueues(data.queues ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const queueForTier = queues.find((q) => q.entryFeeCents === tier);

  const handleJoin = useCallback(async () => {
    if (!token) return;
    setJoinState({ status: "joining" });
    try {
      const res = await fetch("/api/tournaments/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entryFeeCents: tier }),
      });
      if (res.status === 402) {
        const body = (await res.json()) as { shortfall?: number };
        setJoinState({
          status: "error",
          message: `Not enough chips. You need ${body.shortfall ?? tier} more.`,
        });
        return;
      }
      if (res.status === 409) {
        const body = (await res.json()) as { tournamentId?: string };
        if (body.tournamentId) {
          router.push(`/tournaments/${body.tournamentId}`);
        }
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setJoinState({
          status: "error",
          message: body.error ?? "Could not join queue.",
        });
        return;
      }
      const body = (await res.json()) as {
        status: string;
        tournamentId: string;
        entrantCount?: number;
        bracketSize?: number;
      };
      if (body.status === "started") {
        router.push(`/tournaments/${body.tournamentId}`);
        return;
      }
      setJoinState({
        status: "queued",
        entrantCount: body.entrantCount ?? 1,
        bracketSize: body.bracketSize ?? 4,
        tournamentId: body.tournamentId,
      });
    } catch {
      setJoinState({ status: "error", message: "Network error. Try again." });
    }
  }, [token, tier, router]);

  return (
    <main
      id="main-content"
      className="grain topo relative min-h-screen bg-void flex flex-col"
    >
      <div className="shrink-0">
        <Navbar contextLabel="1v1" />
      </div>

      {/* Tab band — same pill as /duel */}
      <div className="border-b border-border-subtle shrink-0">
        <div className="max-w-2xl mx-auto w-full px-4 py-2 flex items-center gap-3">
          <Link
            href="/duel"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border-strong text-text-secondary hover:text-text-primary hover:border-signal/50 transition-colors shrink-0"
            aria-label="Back to duels"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="1v1 sections"
          >
            <NavTab href="/duel/leaderboard" label="Leaderboard" active={false} />
            <NavTab href="/duel" label="Play" active={false} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pt-7 pb-16 flex flex-col gap-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1.5">
            compete
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight uppercase text-text-primary leading-none">
            Tournaments
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Join a queue at your stake. When the bracket fills, the tournament starts automatically.
          </p>
        </header>

        {!user ? (
          <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
            <p className="text-text-secondary text-sm mb-4">
              Sign in to enter tournaments.
            </p>
            <Link
              href="/auth/signin?redirect=%2Ftournaments"
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
            >
              Sign in to play
            </Link>
          </section>
        ) : (
          <>
            {/* Tier picker */}
            <section className="bg-surface rounded-xl border border-border-subtle p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-3">
                Choose entry fee
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CHIP_TIERS.map((t) => {
                  const q = queues.find((qq) => qq.entryFeeCents === t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTier(t);
                        setJoinState({ status: "idle" });
                      }}
                      className={
                        "flex flex-col items-center justify-center rounded-lg border p-3 min-h-[56px] text-sm font-semibold transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
                        (tier === t
                          ? "border-signal bg-signal/10 text-signal"
                          : "border-border-strong text-text-secondary hover:border-signal/40")
                      }
                    >
                      <span className="tabular-nums">{t.toLocaleString()}</span>
                      <span className="text-[10px] text-text-muted font-normal mt-0.5">chips</span>
                      {q && !loading && (
                        <span className="text-[10px] text-text-muted font-normal">
                          {q.entrantCount}/{q.bracketSize}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Queue action */}
            <section className="bg-surface rounded-xl border border-signal/30 shadow-signal p-6">
              <p className="sr-only" aria-live="polite">
                {joinState.status === "joining"
                  ? "Joining tournament queue..."
                  : joinState.status === "queued"
                    ? `Queued: ${joinState.entrantCount} of ${joinState.bracketSize} players.`
                    : joinState.status === "error"
                      ? joinState.message
                      : ""}
              </p>

              {queueForTier && joinState.status === "idle" && (
                <p className="text-text-secondary text-xs font-mono mb-3 text-center">
                  {queueForTier.entrantCount}/{queueForTier.bracketSize} players waiting
                </p>
              )}

              {joinState.status === "idle" && (
                <button
                  onClick={handleJoin}
                  className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 shadow-signal transition-[filter,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Join queue · {tier.toLocaleString()} chips
                </button>
              )}

              {joinState.status === "joining" && (
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm py-3">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Joining queue...
                </div>
              )}

              {joinState.status === "queued" && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="flex items-center gap-2 text-signal text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-signal animate-pulse" aria-hidden="true" />
                    Queued
                  </div>
                  <p className="text-text-secondary text-sm text-center">
                    {joinState.entrantCount} of {joinState.bracketSize} players. The bracket starts automatically when full.
                  </p>
                  <Link
                    href={`/tournaments/${joinState.tournamentId}`}
                    className="text-signal text-sm hover:underline"
                  >
                    View bracket
                  </Link>
                </div>
              )}

              {joinState.status === "error" && (
                <div className="flex flex-col gap-3" role="alert">
                  <p className="text-ember text-sm text-center">{joinState.message}</p>
                  <button
                    onClick={() => setJoinState({ status: "idle" })}
                    className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                  >
                    Try again
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function NavTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (active
          ? "bg-signal text-void hover:brightness-110"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}
