"use client";

/**
 * PaidDuelJoinGate — funding gate shown before a paid duel room.
 *
 * Rendered by DuelRoomLoader when a duel has a stake and both players have not
 * yet staked. Two states:
 *   • Creator waiting  → share the invite, or cancel for an instant refund.
 *   • Invitee          → stake credits to join (instant activation on success).
 * Guests are blocked (a sign-in gate stands in). Once both have staked, the
 * loader tears this down and renders the real DuelRoom.
 */

import { useState } from "react";
import { Navbar } from "../Navbar";
import { useAuth } from "../../contexts/AuthContext";
import { shareInvite } from "../../lib/shareInvite";
import { BuyCreditsModal } from "../Wallet/BuyCreditsModal";
import { duelPayoutCents } from "../../config/paidDuel";

export interface PaidDuelMeta {
  id: string;
  stakeCents: number;
  player1: { id: string; displayName: string | null } | null;
  player2: { id: string; displayName: string | null } | null;
  player1Staked: boolean;
  player2Staked: boolean;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaidDuelJoinGate({
  meta,
  onStaked,
}: {
  meta: PaidDuelMeta;
  /** Called after a successful join so the loader can re-fetch and enter the room. */
  onStaked: () => void;
}) {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  const stake = meta.stakeCents;
  const pot = stake * 2;
  const payout = duelPayoutCents(stake);
  const isCreator = !!user && meta.player1?.id === user.uid;

  async function handleShare() {
    const link = `${window.location.origin}/duel/${meta.id}`;
    await shareInvite(link).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  async function handleCancel() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/${meta.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not cancel.");
        setLoading(false);
        return;
      }
      window.location.href = "/duel";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/duel/paid/${meta.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ageConfirmed: true }),
      });
      if (res.status === 402) {
        setBuyOpen(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not join.");
        setLoading(false);
        return;
      }
      onStaked();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-void text-text-primary">
      <Navbar contextLabel="1v1 · paid" />
      <div className="max-w-md mx-auto px-4 pt-16 pb-16">
        <div className="text-center mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted mb-3">
            paid duel · real stakes
          </p>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase">
            {dollars(stake)} stake
          </h1>
          <p className="mt-3 text-text-secondary text-sm">
            Winner takes <span className="text-signal font-semibold">{dollars(payout)}</span>{" "}
            <span className="text-text-muted">(pot {dollars(pot)}, 10% fee)</span>
          </p>
        </div>

        {/* Guests cannot play paid duels. */}
        {!user ? (
          <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
            <p className="text-text-secondary text-sm mb-4">
              Sign in to stake credits and join this paid duel.
            </p>
            <a
              href={`/auth/signin?redirect=${encodeURIComponent(`/duel/${meta.id}`)}`}
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              Sign in to play
            </a>
          </section>
        ) : isCreator ? (
          // Creator: staked already, waiting for an opponent to stake & join.
          <section className="bg-surface rounded-xl border border-border-subtle p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-text-secondary text-sm mb-5">
              <span
                className="w-4 h-4 rounded-full border-2 border-text-muted border-t-signal animate-spin"
                aria-hidden="true"
              />
              Waiting for your opponent to stake &amp; join…
            </div>
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] transition-[filter,transform] mb-3"
            >
              {shared ? "Shared!" : "Share invite"}
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-ember/50 transition-colors disabled:opacity-40"
            >
              {loading ? "Cancelling…" : "Cancel & refund my stake"}
            </button>
          </section>
        ) : (
          // Invitee: confirm the stake to join.
          <section className="bg-surface rounded-xl border border-border-subtle p-6">
            <p className="text-text-secondary text-sm mb-1">
              <span className="text-text-primary font-semibold">
                {meta.player1?.displayName ?? "An opponent"}
              </span>{" "}
              challenged you to a {dollars(stake)} duel.
            </p>
            <p className="text-text-muted text-xs mb-5">
              Your {dollars(stake)} stake is held until the match resolves. Win and it
              becomes {dollars(payout)} in cashable winnings; if the match never starts,
              it&apos;s refunded.
            </p>
            <button
              onClick={handleJoin}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full px-8 min-h-[48px] w-full bg-signal text-void font-semibold text-base tracking-tight hover:brightness-110 active:scale-[0.98] shadow-signal transition-[filter,transform] disabled:opacity-40"
            >
              {loading ? "Staking…" : `Stake ${dollars(stake)} to join`}
            </button>
            <p className="mt-3 text-center text-text-muted text-[11px]">
              By joining you confirm you are 18+ and agree to the{" "}
              <a href="/terms" className="text-signal underline underline-offset-2" target="_blank">
                Terms
              </a>
              .
            </p>
          </section>
        )}

        {error && (
          <p className="mt-4 text-ember text-sm text-center" role="alert">
            {error}
          </p>
        )}
      </div>

      <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} token={token} />
    </div>
  );
}
