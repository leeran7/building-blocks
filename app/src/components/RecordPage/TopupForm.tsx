"use client";

/**
 * TopupForm — Stripe top-up form for the block record page.
 *
 * V2: Dark theme update. All logic preserved exactly.
 * Design spec: design.md §6.20
 */

import { type FormEvent } from "react";

interface TopupFormProps {
  blockId: string;
  buried: boolean;
}

export function TopupForm({ blockId, buried }: TopupFormProps) {
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const amount = parseFloat(
      (form.elements.namedItem("amount_usd") as HTMLInputElement).value
    );

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "topup",
          block_id: blockId,
          amount_usd: amount,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      <div className="bg-elevated rounded-xl border border-border-subtle p-6">
        <h3 className="text-text-primary font-semibold text-lg mb-1">
          Top up altitude
        </h3>
        <p className="text-text-muted text-sm mb-5">
          {buried
            ? "This block is buried. Top up to rise above ground."
            : "Add more altitude to stay ahead of the rising ground."}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="topup-amount"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Amount (USD)
            </label>
            <input
              id="topup-amount"
              type="number"
              name="amount_usd"
              min="2"
              step="1"
              defaultValue="10"
              className="w-full bg-surface border border-border-subtle rounded-lg px-4 py-3 font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-tech focus:ring-1 focus:ring-accent-tech transition-colors"
              aria-label="Amount in USD"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-accent-tech text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 min-h-[44px] flex items-center justify-center"
          >
            Pay with Stripe →
          </button>
        </form>
      </div>
    </div>
  );
}
