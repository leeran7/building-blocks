"use client";

/**
 * PaidDuelSection — the "play for stakes" surface on /duel.
 *
 * Parallel to the free duel actions, never replacing them. Shows the two-bucket
 * wallet, a fixed stake picker, an 18+ gate, and a create-challenge action that
 * stakes credits (no Stripe at this step). Insufficient balance opens the
 * buy-credits modal rather than dead-ending.
 *
 * Rendered only when signed in and NEXT_PUBLIC_PAID_DUELS_ENABLED is on.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";
import { duelPayoutCents } from "../../config/paidDuel";

const STAKE_TIERS_USD = [1, 2, 5, 10] as const;
const DEFAULT_CATEGORY = "tech";

interface WalletState {
  playCents: number;
  winningsCents: number;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaidDuelSection() {
  const { token } = useAuth();
  const router = useRouter();

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [stakeUsd, setStakeUsd] = useState<number>(1);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(true); // start dismissed; corrected on mount

  const refreshWallet = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/wallet", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const body = (await res.json()) as WalletState;
        setWallet({ playCents: body.playCents, winningsCents: body.winningsCents });
      }
    } catch {
      // Non-critical.
    }
  }, [token]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const balanceCents = (wallet?.playCents ?? 0) + (wallet?.winningsCents ?? 0);

  // First-run explainer: show when both balances are zero and not dismissed.
  useEffect(() => {
    if (wallet && wallet.playCents === 0 && wallet.winningsCents === 0) {
      const dismissed = localStorage.getItem("paid-duel-intro-dismissed") === "1";
      setIntroDismissed(dismissed);
      setIntroOpen(!dismissed);
    }
  }, [wallet]);

  function dismissIntro() {
    localStorage.setItem("paid-duel-intro-dismissed", "1");
    setIntroDismissed(true);
    setIntroOpen(false);
  }

  const handleCreate = useCallback(async () => {
    if (!token || !ageConfirmed) return;
    setLoading(true);
    setError(null);
    setExistingId(null);
    try {
      const res = await fetch("/api/duel/paid", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categorySlug: DEFAULT_CATEGORY, stakeUsd, ageConfirmed: true }),
      });

      if (res.status === 402) {
        setBuyOpen(true);
        setLoading(false);
        return;
      }
      if (res.status === 451) {
        setGeoBlocked(true);
        setLoading(false);
        return;
      }
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { existingId?: string };
        setExistingId(body.existingId ?? null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the challenge.");
        setLoading(false);
        return;
      }

      const body = (await res.json()) as { duelId: string };
      router.push(`/duel/${body.duelId}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }, [token, ageConfirmed, stakeUsd, router]);

  const stakeCents = stakeUsd * 100;
  const payoutCents = duelPayoutCents(stakeCents);

  if (geoBlocked) {
    return (
      <section className="bg-surface-raised rounded-xl border border-border-subtle p-6 text-center">
        <p className="text-text-secondary text-sm mb-3">
          Paid duels are not available in your region.
        </p>
        <a
          href="#free-duel"
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          Play a free match ↑
        </a>
      </section>
    );
  }

  return (
    <section className="bg-surface-raised rounded-xl border border-signal/30 shadow-signal p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal mb-0.5">[ real stakes ]</p>
      <h2 className="font-semibold text-text-primary mb-1">Paid 1v1 — winner takes the pot</h2>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">
          Play for stakes
        </span>
        {wallet && (
          <span className="font-mono text-xs tabular-nums text-text-muted">
            <span className="text-signal font-semibold">{dollars(wallet.winningsCents)}</span> won
            {" · "}
            {dollars(wallet.playCents)} credits
          </span>
        )}
      </div>
      <p className="text-text-secondary text-sm mb-4">
        Stake credits head-to-head. Winner takes{" "}
        <span className="text-signal font-semibold">{dollars(payoutCents)}</span>{" "}
        <span className="text-text-muted">(10% fee)</span>.
      </p>

      {/* First-run explainer — shown once when both balances are zero */}
      {!introDismissed && introOpen && (
        <div className="mb-4 rounded-lg border border-border-subtle bg-surface p-3 text-xs text-text-muted">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="font-mono uppercase tracking-[0.12em] text-text-secondary text-[11px]">
              How it works
            </span>
            <button
              onClick={dismissIntro}
              aria-label="Dismiss"
              className="text-text-muted hover:text-text-primary transition-colors leading-none"
            >
              ×
            </button>
          </div>
          <p className="leading-relaxed">
            Buy credits → stake on a match → winner takes 90% of the pot.
          </p>
          <p className="leading-relaxed mt-1">
            Credits you buy are for playing only — not withdrawable.
          </p>
          <p className="leading-relaxed mt-1">
            Winnings you earn are cashable to your bank.
          </p>
          <button
            onClick={dismissIntro}
            className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-signal hover:underline"
          >
            Got it
          </button>
        </div>
      )}

      {/* Stake picker */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {STAKE_TIERS_USD.map((usd) => (
          <button
            key={usd}
            onClick={() => setStakeUsd(usd)}
            className={`inline-flex items-center justify-center rounded-full min-h-[44px] text-sm font-semibold tabular-nums transition-colors ${
              stakeUsd === usd
                ? "bg-signal text-void"
                : "border border-border-strong text-text-secondary hover:border-signal/50"
            }`}
          >
            ${usd}
          </button>
        ))}
      </div>

      <label className="flex items-start gap-2 mb-4 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          className="mt-0.5 accent-signal"
        />
        <span>
          I confirm I am 18+ and agree to the{" "}
          <a href="/terms" className="text-signal underline underline-offset-2" target="_blank">
            Terms
          </a>
          .
        </span>
      </label>

      {existingId ? (
        <div className="flex flex-col gap-2">
          <p className="text-warning text-sm">You already have an open paid challenge.</p>
          <a
            href={`/duel/${existingId}`}
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            Go to it
          </a>
        </div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={loading || !ageConfirmed}
          className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Creating…" : `Create $${stakeUsd} challenge`}
        </button>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setBuyOpen(true)}
          className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          + Buy credits
        </button>
        <span className="font-mono text-[11px] text-text-muted tabular-nums">
          balance {dollars(balanceCents)}
        </span>
      </div>

      {error && (
        <p className="mt-3 text-ember text-sm" role="alert">
          {error}
        </p>
      )}

      <BuyCreditsModal
        open={buyOpen}
        onClose={() => {
          setBuyOpen(false);
          refreshWallet();
        }}
        token={token}
      />
    </section>
  );
}
