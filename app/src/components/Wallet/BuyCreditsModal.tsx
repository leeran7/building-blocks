"use client";

/**
 * BuyCreditsModal — top up the prepaid credit balance via Stripe.
 *
 * The only Stripe touchpoint in the paid-duel loop. Quick-pick amounts plus a
 * custom entry; an 18+ checkbox gates the action (also enforced server-side).
 * On submit we POST /api/credits/checkout and redirect to Stripe Checkout.
 */

import { useState } from "react";

const QUICK_USD = [5, 10, 20, 50];

interface BuyCreditsModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
}

export function BuyCreditsModal({ open, onClose, token }: BuyCreditsModalProps) {
  const [amountUsd, setAmountUsd] = useState<number>(20);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleBuy() {
    if (!token || !ageConfirmed || amountUsd <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountUsd, ageConfirmed: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not start checkout.");
        setLoading(false);
        return;
      }
      const body = (await res.json()) as { checkoutUrl: string };
      window.location.href = body.checkoutUrl;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Buy credits"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border-strong bg-surface-raised p-6 shadow-lifted"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted mb-1">
          wallet
        </p>
        <h2 className="font-display text-2xl font-black tracking-tight text-text-primary mb-4">
          Buy credits
        </h2>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {QUICK_USD.map((usd) => (
            <button
              key={usd}
              onClick={() => setAmountUsd(usd)}
              className={`inline-flex items-center justify-center rounded-full min-h-[44px] text-sm font-semibold tabular-nums transition-colors ${
                amountUsd === usd
                  ? "bg-signal text-void"
                  : "border border-border-strong text-text-secondary hover:border-signal/50"
              }`}
            >
              ${usd}
            </button>
          ))}
        </div>

        <label className="block mb-4">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted">
            Custom amount (USD)
          </span>
          <input
            type="number"
            min={5}
            max={500}
            value={amountUsd}
            onChange={(e) => setAmountUsd(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-text-primary tabular-nums focus:border-signal focus:outline-none"
          />
        </label>

        <label className="flex items-start gap-2 mb-4 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            className="mt-0.5 accent-signal"
          />
          <span>
            I confirm I am 18 or older and agree to the{" "}
            <a href="/terms" className="text-signal underline underline-offset-2" target="_blank">
              Terms
            </a>
            . Credits are non-refundable play credits; only winnings are cashable.
          </span>
        </label>

        {error && <p className="text-ember text-sm mb-3" role="alert">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-text-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleBuy}
            disabled={!ageConfirmed || loading || amountUsd <= 0 || !token}
            className="flex-1 inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm tracking-tight hover:brightness-110 active:scale-[0.98] transition-[filter,transform] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Starting…" : `Buy $${amountUsd} in credits`}
          </button>
        </div>
      </div>
    </div>
  );
}
