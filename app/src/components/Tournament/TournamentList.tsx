"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { Navbar } from "../Navbar";
import { CHIP_TIERS } from "../../db/chips";
import { formatChipCents } from "../../config/chipPackages";
import { authedFetch } from "../../lib/authedFetch";
import { DUEL_LEADERBOARD_HREF, DUEL_HREF } from "../navLinks";
import { Spinner } from "../ui/Spinner";
import { NavTab } from "../ui/NavTab";
import { SignInGate } from "../ui/SignInGate";

type JoinState =
  | { status: "idle" }
  | { status: "joining" }
  | { status: "queued"; entrantCount: number; bracketSize: number; tournamentId: string }
  | { status: "error"; message: string };

export function TournamentList() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState<number>(CHIP_TIERS[0]);
  const [joinState, setJoinState] = useState<JoinState>({ status: "idle" });

  const handleJoin = useCallback(async () => {
    if (!token) return;
    setJoinState({ status: "joining" });
    try {
      const res = await authedFetch("/api/tournaments/queue", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      {/* Tab band */}
      <div className="border-b border-border-subtle shrink-0">
        <div className="max-w-2xl mx-auto w-full px-4 py-2">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="1v1 sections"
          >
            <NavTab href={DUEL_LEADERBOARD_HREF} label="Leaderboard" active={false} />
            <NavTab href={DUEL_HREF} label="Play" active={false} />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 pt-7 pb-16 flex flex-col gap-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1.5">
            multiplayer · compete
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight uppercase text-text-primary leading-none">
            Tournaments
          </h1>
        </header>

        {!user ? (
          <SignInGate message="Sign in to enter tournaments." redirectPath="/tournaments" />
        ) : (
          <>
            {/* Tier picker */}
            <section className="bg-surface rounded-xl border border-border-subtle p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-3">
                Choose entry fee
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CHIP_TIERS.map((t) => (
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
                      <span className="tabular-nums">{formatChipCents(t)}</span>
                      <span className="text-[10px] text-text-muted font-normal mt-0.5">chips</span>
                    </button>
                ))}
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

              {joinState.status === "idle" && (
                <button
                  onClick={handleJoin}
                  className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 shadow-signal transition-[filter,transform,scale] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  Join queue · {tier.toLocaleString()} chips
                </button>
              )}

              {joinState.status === "joining" && (
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm py-3">
                  <Spinner />
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

