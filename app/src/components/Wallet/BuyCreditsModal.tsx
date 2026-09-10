"use client";

/**
 * BuyCreditsModal — buy non-cashable chips via Stripe Checkout.
 *
 * Packages give volume bonuses: $5 = 500 (base), $10 = 1,100 (+10%),
 * $20 = 2,400 (+20%), $50 = 6,500 (+30%). Custom amounts use base rate.
 * On submit we POST /api/credits/checkout and redirect to Stripe Checkout.
 */

import { useState } from "react";
import {
  CHIP_PACKAGES,
  chipsForUsd as chipCount,
} from "../../config/chipPackages";

const PACKAGES = CHIP_PACKAGES.map((p) => ({
  ...p,
  tag:
    p.bonusPct === 0
      ? undefined
      : p.usd === 50
        ? "Best value"
        : `+${p.bonusPct}%`,
}));

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

  const chips = chipCount(amountUsd);
  const isPackage = PACKAGES.some((p) => p.usd === amountUsd);

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
      aria-label="Buy chips"
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
          Buy chips
        </h2>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.usd}
              onClick={() => setAmountUsd(pkg.usd)}
              className={`relative flex flex-col items-center justify-center rounded-xl min-h-[72px] text-sm font-semibold tabular-nums transition-colors ${
                amountUsd === pkg.usd
                  ? "bg-signal text-void"
                  : "border border-border-strong text-text-secondary hover:border-signal/50"
              }`}
            >
              {pkg.tag && (
                <span
                  className={`absolute -top-2 right-2 text-[10px] font-bold rounded-full px-2 py-0.5 ${
                    amountUsd === pkg.usd
                      ? "bg-void/20 text-void"
                      : pkg.usd === 50
                        ? "bg-signal/20 text-signal"
                        : "bg-signal/10 text-signal"
                  }`}
                >
                  {pkg.tag}
                </span>
              )}
              <span className="text-lg font-bold">${pkg.usd}</span>
              <span className={`text-xs font-normal ${amountUsd === pkg.usd ? "text-void/70" : "text-text-muted"}`}>
                {pkg.chips.toLocaleString()} chips
              </span>
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
            value={isPackage ? "" : amountUsd}
            placeholder={isPackage ? String(amountUsd) : undefined}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) setAmountUsd(v);
            }}
            onFocus={() => {
              if (isPackage) setAmountUsd(amountUsd);
            }}
            className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-text-primary tabular-nums focus:border-signal focus:outline-none"
          />
          {!isPackage && amountUsd > 0 && (
            <span className="block mt-1 text-xs text-text-muted tabular-nums">
              = {chips.toLocaleString()} chips (base rate)
            </span>
          )}
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
            . Chips are non-refundable and non-cashable.
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
            {loading ? "Starting..." : `Buy ${chips.toLocaleString()} chips · $${amountUsd}`}
          </button>
        </div>
      </div>
    </div>
  );
}
