"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { Navbar } from "../Navbar";
import { CHIP_TIERS, DAILY_CHIP_GRANT_CENTS } from "../../db/chips";
import { formatChipCents } from "../../config/chipPackages";
import { useClaimDailyChips } from "../../hooks/useClaimDailyChips";
import { authedFetch } from "../../lib/authedFetch";
import { DUEL_LEADERBOARD_HREF, DUEL_HREF } from "../navLinks";
import { Spinner } from "../ui/Spinner";
import { NavTab } from "../ui/NavTab";
import { SignInGate } from "../ui/SignInGate";
import { Button } from "../ui/Button";
import { DailyChipClaimButton } from "../ui/DailyChipClaimButton";

type MatchState =
  | { status: "idle" }
  | { status: "matching" }
  | { status: "error"; message: string };

export function ChipDuelLobby() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState<number>(CHIP_TIERS[0]);
  const [matchState, setMatchState] = useState<MatchState>({ status: "idle" });
  const { state: claimState, claim: handleClaim } = useClaimDailyChips(token);

  const handleMatch = useCallback(async () => {
    if (!token) return;
    setMatchState({ status: "matching" });
    try {
      const res = await authedFetch("/api/duel/chips/match", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeCents: tier, categorySlug: "random" }),
      });
      if (res.status === 402) {
        const body = (await res.json()) as { shortfall?: number };
        setMatchState({
          status: "error",
          message: `Not enough chips. You need ${formatChipCents(body.shortfall ?? tier)} more.`,
        });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMatchState({
          status: "error",
          message: body.error ?? "Could not find a match.",
        });
        return;
      }
      const body = (await res.json()) as { duelId: string };
      router.push(`/duel/${body.duelId}`);
    } catch {
      setMatchState({ status: "error", message: "Network error. Try again." });
    }
  }, [token, tier, router]);

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
            <NavTab href={DUEL_LEADERBOARD_HREF} label="Leaderboard" active={false} />
            <NavTab href={DUEL_HREF} label="Play" active={false} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-7 pb-16 flex flex-col gap-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-1.5">
            multiplayer · ranked
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-black tracking-tight uppercase text-text-primary leading-none">
            Chip Duels
          </h1>
          <p className="text-xs text-text-muted mt-2">
            Chips have no cash value and can&apos;t be redeemed, transferred, or sold.
          </p>
        </header>

        {!user ? (
          <SignInGate message="Sign in to play chip duels." redirectPath="/duel/chips" />
        ) : (
          <>
            {/* Daily free chips — ongoing no-purchase way to play, not just a one-time signup grant */}
            <section className="bg-surface rounded-xl border border-border-subtle p-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-1">
                  Daily free chips
                </h2>
                <p className="text-sm text-text-secondary">
                  Claim {formatChipCents(DAILY_CHIP_GRANT_CENTS)} free chips every day — no purchase required.
                </p>
                {claimState.status === "already-claimed" && (
                  <p className="text-xs text-text-muted mt-1">Already claimed today. Come back tomorrow.</p>
                )}
              </div>
              <DailyChipClaimButton
                state={claimState}
                onClaim={handleClaim}
                labels={{ idle: "Claim free chips", claimed: "Claimed", alreadyClaimed: "Come back tomorrow" }}
                className="flex-shrink-0 inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-signal/40 text-signal font-semibold text-sm hover:bg-signal/10 active:scale-[0.98] motion-reduce:active:scale-100 transition-[filter,transform,background-color] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
              />
            </section>

            {/* Tier picker */}
            <section className="bg-surface rounded-xl border border-border-subtle p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted mb-3">
                Choose stake
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CHIP_TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
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

            {/* Match action */}
            <section className="bg-surface rounded-xl border border-signal/30 shadow-signal p-6">
              <p className="sr-only" aria-live="polite">
                {matchState.status === "matching"
                  ? "Searching for a chip duel opponent..."
                  : matchState.status === "error"
                    ? matchState.message
                    : ""}
              </p>

              {matchState.status === "idle" && (
                <Button variant="primary" size="lg" fullWidth onClick={handleMatch}>
                  Find match · {formatChipCents(tier)} chips
                </Button>
              )}

              {matchState.status === "matching" && (
                <div className="flex items-center justify-center gap-2 text-text-secondary text-sm py-3">
                  <Spinner />
                  Searching for an opponent...
                </div>
              )}

              {matchState.status === "error" && (
                <div className="flex flex-col gap-3" role="alert">
                  <p className="text-ember text-sm text-center">{matchState.message}</p>
                  <Button variant="ghost" size="lg" fullWidth onClick={() => setMatchState({ status: "idle" })}>
                    Try again
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

