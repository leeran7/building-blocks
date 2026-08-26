"use client";

/**
 * Reset Password page — /auth/reset-password
 *
 * Design spec: design.md §6.13, §7.6
 * AC-54: Same message regardless of whether email is registered (anti-enumeration)
 * AC-55: sendPasswordResetEmail called exactly once
 * R-12: Never expose Firebase error codes — always show generic success message
 *
 * WCAG:
 * - Confirmation message: role="status" aria-live="polite" (AC-46)
 */

import { type FormEvent, useId, useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../../src/lib/firebase";
import { AuthShell } from "../../../src/components/Auth/AuthShell";

function WarningIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const INPUT_BASE =
  "w-full bg-surface border border-border-subtle rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

export default function ResetPasswordPage() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNetworkError(false);

    try {
      // AC-55: sendPasswordResetEmail called exactly once
      await sendPasswordResetEmail(auth, email);
    } catch {
      // AC-54 / R-12: Never surface Firebase errors — always show same success message
      // The only exception is a network failure that indicates we couldn't even try
    }

    // AC-54: Always show same message regardless of email registration status
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <AuthShell>
      <section
        className="bg-surface rounded-2xl border border-border-subtle p-8 w-full max-w-sm"
        aria-labelledby="auth-card-title"
      >
        <p className="text-2xl font-bold text-text-primary mb-1 md:hidden">Tower</p>
        <h1
          id="auth-card-title"
          className="text-lg font-semibold text-text-primary mb-1"
        >
          Reset your password
        </h1>
        <p className="text-sm text-text-muted mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {submitted ? (
          // After-submit state — same message always (AC-54)
          <div
            role="status"
            aria-live="polite"
            className="bg-success/10 border border-success/30 rounded-lg px-4 py-4 text-sm text-text-primary"
          >
            <span className="text-success font-semibold mr-1">✓</span>
            If an account exists for this email, a reset link has been sent.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {networkError && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center gap-2 text-sm text-danger mb-4 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2"
              >
                <WarningIcon />
                <span>Something went wrong. Please try again.</span>
              </div>
            )}

            <div className="mb-6">
              <label
                htmlFor={emailId}
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Email address
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_BASE}
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-signal text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        )}

        <div className="mt-6">
          <Link
            href="/auth/signin"
            className="text-sm text-text-muted underline hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
          >
            ← Back to sign in
          </Link>
        </div>
      </section>
    </AuthShell>
  );
}
