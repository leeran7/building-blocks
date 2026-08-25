"use client";

/**
 * Verify Email page — /auth/verify-email
 *
 * Design spec: design.md §6.12, §7.5
 * AC-51: Shows "Check your inbox" + Resend button when emailVerified=false
 * AC-52: After Firebase verification link clicked, next sign-in upserts emailVerified=true
 * AC-53: Shows "Already verified" + /dashboard link when emailVerified=true
 */

import { useState } from "react";
import Link from "next/link";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../../../src/contexts/AuthContext";
import { AuthShell } from "../../../src/components/Auth/AuthShell";

function EnvelopeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

type ResendState = "idle" | "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  // Already verified — AC-53
  const isVerified = user?.emailVerified === true;

  const handleResend = async () => {
    if (!user || resendState === "loading") return;
    setResendState("loading");
    setResendError(null);

    try {
      await sendEmailVerification(user);
      setResendState("success");
      // Reset button after 3 seconds
      setTimeout(() => setResendState("idle"), 3000);
    } catch {
      setResendState("error");
      setResendError("Failed to send verification email. Please try again.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-void flex items-center justify-center px-4">
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-accent-tech rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <AuthShell>
      <section
        className="bg-surface rounded-2xl border border-border-subtle p-8 w-full max-w-sm text-center"
        aria-labelledby="auth-card-title"
      >
        <p className="text-2xl font-bold text-text-primary mb-6 md:hidden">Tower</p>

        {isVerified ? (
          // AC-53: Already verified state
          <>
            <div className="text-success flex justify-center mb-4">
              <CheckCircleIcon />
            </div>
            <h1
              id="auth-card-title"
              className="text-lg font-semibold text-text-primary mb-4"
            >
              Your email is already verified
            </h1>
            <Link
              href="/dashboard"
              className="w-full bg-accent-tech text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 inline-flex items-center justify-center min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Go to dashboard
            </Link>
          </>
        ) : (
          // AC-51: Unverified state — check inbox
          <>
            <div className="text-accent-tech flex justify-center mb-4">
              <EnvelopeIcon />
            </div>
            <h1
              id="auth-card-title"
              className="text-lg font-semibold text-text-primary mb-3"
            >
              Check your inbox
            </h1>
            <p className="text-sm text-text-muted mb-6 leading-relaxed">
              We sent a verification link to{" "}
              <span className="text-text-primary font-medium">
                {user?.email ?? "your email"}
              </span>
              . Click the link to verify your account.
            </p>

            {/* Resend error */}
            {resendError && (
              <p
                role="alert"
                aria-live="assertive"
                className="text-sm text-danger mb-4"
              >
                {resendError}
              </p>
            )}

            {/* Resend button */}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === "loading"}
              className="w-full bg-surface border border-border-subtle rounded-lg py-2.5 px-4 text-sm text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {resendState === "loading" ? (
                <>
                  <span className="w-4 h-4 border-2 border-text-muted/30 border-t-text-primary rounded-full animate-spin" />
                  Sending…
                </>
              ) : resendState === "success" ? (
                <span
                  role="status"
                  aria-live="polite"
                >
                  Email sent ✓
                </span>
              ) : (
                "Resend verification email"
              )}
            </button>

            {/* Already verified link */}
            <div className="mt-6 border-t border-border-subtle pt-4">
              <p className="text-xs text-text-muted mb-2">
                Already verified?
              </p>
              <Link
                href="/dashboard"
                className="text-sm text-accent-tech hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
              >
                Go to dashboard →
              </Link>
            </div>
          </>
        )}
      </section>
    </AuthShell>
  );
}
