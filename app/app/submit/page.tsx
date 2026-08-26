"use client";

/**
 * /submit — create a new block (Story 3.1).
 *
 * Auth-gated: signed-in users get the form; signed-out users are redirected to
 * sign-in (with return path). Submitting POSTs to /api/checkout (type "new")
 * with the Firebase Bearer token → Stripe Checkout. This is the destination for
 * the "Submit a block" CTAs (previously they always bounced to /auth/signup).
 */

import { type FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../src/contexts/AuthContext";
import { Navbar } from "../../src/components/Navbar";
import { GAME_CATEGORIES, FAMILIES } from "../../src/game/categories";

const INPUT =
  "w-full bg-surface border border-border-subtle rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

function SubmitForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading: authLoading } = useAuth();

  const initialCategory = (searchParams.get("category") ?? "tech").toLowerCase();
  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [amount, setAmount] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || !token) {
    if (typeof window !== "undefined") {
      router.push("/auth/signin?redirect=%2Fsubmit");
    }
    return null;
  }
  if (!user.email) {
    // Anonymous/guest — needs a real account to own a block
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Create an account first
        </h1>
        <p className="text-text-secondary mt-2">
          Submitting a block links it to your account, so you need an email
          sign-in (not a guest session).
        </p>
        <Link
          href="/auth/signup?redirect=%2Fsubmit"
          className="mt-6 inline-flex bg-signal text-void font-semibold rounded-lg px-6 py-3 hover:brightness-110 transition min-h-[44px] items-center"
        >
          Create account
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "new",
          url,
          display_name: displayName,
          owner_email: user!.email,
          category,
          amount_usd: parseFloat(amount),
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setError(data.error ?? "We couldn't start checkout. Please try again.");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.15em] text-text-muted">
          New listing
        </p>
        <h1 className="font-display text-4xl text-text-primary mt-2">
          Submit a block
        </h1>
        <p className="text-text-secondary mt-2">
          Buy your starting altitude. Your block enters the tower the moment
          payment completes.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-5"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="display_name" className="block text-sm font-medium text-text-primary mb-1.5">
            Display name
          </label>
          <input
            id="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT}
            placeholder="Acme SaaS"
            maxLength={100}
            required
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="url" className="block text-sm font-medium text-text-primary mb-1.5">
            URL
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${INPUT} font-mono`}
            placeholder="https://example.com"
            required
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-text-primary mb-1.5">
            Tower
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={INPUT}
            disabled={submitting}
          >
            {FAMILIES.map((family) => (
              <optgroup key={family} label={family}>
                {GAME_CATEGORIES.filter((c) => c.family === family).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-text-primary mb-1.5">
            Starting amount (USD)
          </label>
          <input
            id="amount"
            type="number"
            min="5"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${INPUT} font-mono`}
            required
            disabled={submitting}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Minimum $5. Altitude is permanent and non-refundable.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-signal text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
              Redirecting…
            </>
          ) : (
            "Continue to payment →"
          )}
        </button>
      </form>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <main className="min-h-screen bg-void">
      <Navbar />
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
          </div>
        }
      >
        <SubmitForm />
      </Suspense>
    </main>
  );
}
