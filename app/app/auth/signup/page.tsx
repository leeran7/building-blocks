"use client";

/**
 * Sign Up page — /auth/signup
 *
 * Design spec: design.md §6.11, §7.4
 * AC-7: Valid email+password → Firebase account → POST /api/auth/sync → /auth/verify-email
 *   (forwarding the redirect param, or the /dashboard default target)
 * AC-8: Duplicate email → inline error "An account with this email already exists"
 * AC-48: Google OAuth → /dashboard (or redirect param target)
 * AC-49: Dismissed popup → silent
 * AC-50: Google OAuth always sets emailVerified=true, so it skips verify-email
 *   and navigates straight to the target — the email/password path can't (a
 *   fresh account is always unverified), so it always stops at verify-email
 *   first, carrying the target forward for verify-email to finish the trip.
 *
 * WCAG:
 * - All fields have <label>
 * - Errors role="alert" aria-live="assertive"
 * - Password strength bar decorative (no color-only info)
 *
 * useSearchParams requires a Suspense boundary in Next.js 14.
 * SignUpForm is the inner component; SignUpPage wraps it in Suspense.
 */

import { type FormEvent, useEffect, useId, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "../../../src/lib/firebase";
import { AuthShell } from "../../../src/components/Auth/AuthShell";
import { setTokenCookie } from "../../../src/lib/authCookie";
import { safeInternalPath } from "../../../src/lib/safeRedirect";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

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
      className="shrink-0"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Password strength score 0-4 based on password content.
 * Returns a number for the strength bar (4 segments).
 */
function getPasswordStrength(pwd: string): number {
  if (pwd.length === 0) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

const STRENGTH_COLORS = [
  "bg-danger",     // 1 — weak
  "bg-yellow-500", // 2 — fair
  "bg-yellow-400", // 3 — good
  "bg-success",    // 4 — strong
];

const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"];

const INPUT_BASE =
  "w-full bg-surface-raised border border-border-strong rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-hidden focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

async function syncUserToDb(token: string, email: string) {
  await fetch("/api/auth/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
}

/** Inner form that reads useSearchParams — must be wrapped in Suspense */
function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailId = useId();
  const passwordId = useId();
  const formId = useId();
  const googleBtnRef = useRef<HTMLButtonElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  // Raw param (forwarded onward to verify-email / signin) vs. the validated
  // target we actually navigate to for paths that skip verify-email.
  const redirectParam = searchParams.get("redirect");
  const redirectTo = safeInternalPath(redirectParam, "/dashboard");
  const verifyEmailHref = redirectParam
    ? `/auth/verify-email?redirect=${encodeURIComponent(redirectParam)}`
    : "/auth/verify-email";
  const signinHref = redirectParam
    ? `/auth/signin?redirect=${encodeURIComponent(redirectParam)}`
    : "/auth/signin";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      // AC-7a: Send verification email
      await sendEmailVerification(userCredential.user);
      // AC-7b: Sync user to DB
      const token = await userCredential.user.getIdToken();
      await syncUserToDb(token, email);
      // AC-7c: Redirect to verify-email, carrying the eventual target forward.
      router.push(verifyEmailHref);
    } catch (err: unknown) {
      const code =
        err instanceof Error && "code" in err
          ? (err as { code: string }).code
          : "";
      if (
        code === "auth/email-already-in-use" ||
        code === "auth/email-already-exists"
      ) {
        setError("An account with this email already exists");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 8 characters and more complex");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Google uses full-page REDIRECT (not popup) — no popup blockers / COOP / mobile
  // issues. The result is completed on return below.
  const handleGoogle = () => {
    setGoogleLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider).catch(() => {
      setError("Google sign-up failed. Please try again.");
      setGoogleLoading(false);
      googleBtnRef.current?.focus();
    });
  };

  // On return from the Google redirect: provision the user + navigate.
  useEffect(() => {
    let live = true;
    getRedirectResult(auth)
      .then(async (result) => {
        if (!live || !result?.user) return;
        setGoogleLoading(true);
        const token = await result.user.getIdToken();
        await syncUserToDb(token, result.user.email ?? "");
        setTokenCookie(token);
        // Google accounts are pre-verified (AC-50) — no verify-email stop needed.
        router.push(redirectTo);
      })
      .catch((err: unknown) => {
        const code =
          err instanceof Error && "code" in err
            ? (err as { code: string }).code
            : "";
        console.error("[google redirect] signup failed", code, err);
        if (!live) return;
        setError(
          code === "auth/unauthorized-domain"
            ? "This domain isn't authorized for Google sign-in yet."
            : `Google sign-up failed${code ? ` (${code})` : ""}. Please try again.`
        );
      });
    return () => {
      live = false;
    };
  }, [router, redirectTo]);

  return (
    <AuthShell>
      <section
        className="relative overflow-hidden bg-surface rounded-2xl border border-border-strong p-8 shadow-lifted edge-signal w-full max-w-sm"
        aria-labelledby="auth-card-title"
      >
        {/* Logo — mobile only; desktop shows the brand panel */}
        <div className="flex items-center gap-2.5 mb-5 md:hidden">
          <span className="h-6 w-[3px] rounded-full bg-signal" aria-hidden="true" />
          <span className="font-display text-xl tracking-tight text-text-primary">DOOMSTACK</span>
        </div>

        {/* Title */}
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ sign up ]
        </span>
        <h1
          id="auth-card-title"
          className="font-display text-3xl text-text-primary mt-2 mb-1"
        >
          Create account
        </h1>
        <p className="text-sm text-text-muted mb-6">Join the leaderboard</p>

        <form
          id={formId}
          aria-labelledby="auth-card-title"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Error region */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-center gap-2 text-sm text-danger mb-4 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2"
            >
              <WarningIcon />
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
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

          {/* Password */}
          <div className="mb-2">
            <label
              htmlFor={passwordId}
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Password{" "}
              <span className="font-normal text-text-muted">(8+ characters)</span>
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_BASE} pr-11`}
                placeholder="••••••••"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Password strength bar — 4 segments */}
          {password.length > 0 && (
            <div className="mb-4">
              <div className="flex gap-1 h-1.5 mb-1" aria-hidden="true">
                {[1, 2, 3, 4].map((seg) => (
                  <div
                    key={seg}
                    className={`flex-1 rounded-full transition-colors ${
                      strength >= seg
                        ? STRENGTH_COLORS[strength - 1]
                        : "bg-border-subtle"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-text-muted">
                {STRENGTH_LABELS[strength - 1] ?? ""}
              </p>
            </div>
          )}

          {/* Primary CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] mt-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-border-subtle" />
          <span className="text-xs text-text-muted">or continue with</span>
          <div className="flex-1 border-t border-border-subtle" />
        </div>

        {/* Google OAuth */}
        <button
          ref={googleBtnRef}
          id="google-btn"
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          aria-label="Continue with Google OAuth"
          className="w-full bg-surface border border-border-subtle rounded-lg py-3 flex items-center justify-center gap-3 text-sm text-text-primary hover:bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {googleLoading ? (
            <span className="w-4 h-4 border-2 border-text-muted/30 border-t-text-primary rounded-full animate-spin" />
          ) : (
            <GoogleLogo />
          )}
          Continue with Google
        </button>

        {/* Continue as guest */}
        <GuestButton redirectParam={redirectParam} />

        {/* Toggle to sign in */}
        <p className="text-sm text-text-muted text-center mt-4">
          Already have an account?{" "}
          <Link href={signinHref} className="text-signal hover:underline">
            Sign in
          </Link>
        </p>

        <p className="text-xs text-text-muted text-center mt-4">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-signal hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-signal hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </AuthShell>
  );
}

/** Page export — wraps SignUpForm in Suspense (required for useSearchParams) */
export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="min-h-screen bg-void flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
        </main>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}

function GuestButton({ redirectParam }: { redirectParam: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to /dashboard, matching the guest button on /auth/signin, but still
  // honor an explicit redirect target — e.g. "continue as guest" from a duel
  // invite link.
  const redirectTo = safeInternalPath(redirectParam, "/dashboard");

  return (
    <>
      {error && (
        <p role="alert" className="text-xs text-danger text-center mt-2">{error}</p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          setError(null);
          signInAnonymously(auth)
            .then(() => router.push(redirectTo))
            .catch(() => setError("Could not sign in as guest. Please try again."))
            .finally(() => setLoading(false));
        }}
        className="w-full mt-3 text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] flex items-center justify-center disabled:opacity-50"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
        ) : (
          "Continue as guest"
        )}
      </button>
    </>
  );
}
