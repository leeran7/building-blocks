"use client";

/**
 * TopupForm — Stripe top-up for a block record page.
 *
 * Tower Dark Editorial: accent-themed (inherits the page's category accent),
 * quick-amount chips, inline calm error handling (no browser alert), and a
 * loading state. Logic preserved: POST /api/checkout { type, block_id,
 * amount_usd } → redirect to Stripe. Input keeps name="amount_usd", min 2.
 */

import { type FormEvent, useState } from "react";

interface TopupFormProps {
  blockId: string;
  buried: boolean;
}

const QUICK_AMOUNTS = [5, 10, 25, 50];

export function TopupForm({ blockId, buried }: TopupFormProps) {
  const [amount, setAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "topup",
          block_id: blockId,
          amount_usd: parseFloat(amount),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return; // keep the spinner while the browser navigates
      }
      setError(data.error ?? "We couldn't start checkout. Please try again.");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      <div className="bg-surface rounded-2xl border border-border-subtle p-6 shadow-card">
        <h2 className="text-text-primary font-bold text-lg tracking-tight">
          Top up altitude
        </h2>
        <p className="text-text-secondary text-sm mt-1 mb-5">
          {buried
            ? "This block is buried. Top up to rise back above the ground line."
            : "Add altitude to stay ahead of the rising ground."}
        </p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4"
          >
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="topup-amount"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Amount (USD)
          </label>

          {/* Quick amounts */}
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_AMOUNTS.map((v) => {
              const active = amount === String(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  aria-pressed={active}
                  className={[
                    "font-mono text-sm rounded-lg px-3.5 py-2 border transition-colors min-h-[40px]",
                    active
                      ? "border-accent text-accent bg-accent/10"
                      : "border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary",
                  ].join(" ")}
                >
                  ${v}
                </button>
              );
            })}
          </div>

          <input
            id="topup-amount"
            type="number"
            name="amount_usd"
            min="2"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
            className="w-full bg-void border border-border-subtle rounded-lg px-4 py-3 font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50"
            aria-label="Amount in USD"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-accent text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                Redirecting…
              </>
            ) : (
              "Pay with Stripe →"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
