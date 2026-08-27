"use client";

/**
 * Sign In page — /auth/signin
 *
 * Design spec: design.md §6.10, §7.3
 * AC-9: Valid credentials → /dashboard (or redirect param target)
 * AC-10: Wrong password → inline error, password cleared, email retained
 * AC-48: Google OAuth → /dashboard
 * AC-49: Dismissed popup → silent, no error
 * R-10: signInWithPopup called synchronously inside click handler
 *
 * WCAG:
 * - All fields have associated <label>
 * - Errors use role="alert" aria-live="assertive"
 * - Focus ring: ring-signal (5.2:1)
 *
 * useSearchParams requires a Suspense boundary in Next.js 14.
 * SignInForm is the inner component; SignInPage wraps it in Suspense.
 */

import { type FormEvent, useId, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
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
      className="flex-shrink-0"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

const INPUT_BASE =
  "w-full bg-surface-raised border border-border-strong rounded-lg px-4 py-3 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-signal focus:ring-1 focus:ring-signal transition-colors";

/** Inner form that reads useSearchParams — must be wrapped in Suspense */
function SignInForm() {
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
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate the redirect target — never push to an attacker-supplied off-site URL.
  const redirectTo = safeInternalPath(searchParams.get("redirect"), "/dashboard");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Set the middleware cookie before navigating so /dashboard isn't bounced.
      setTokenCookie(await cred.user.getIdToken());
      router.push(redirectTo);
    } catch (err: unknown) {
      const code =
        err instanceof Error && "code" in err
          ? (err as { code: string }).code
          : "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/user-not-found" ||
        code === "auth/invalid-credential"
      ) {
        setError("Invalid email or password");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    // R-10: Must call signInWithPopup synchronously inside a click handler
    const provider = new GoogleAuthProvider();
    setGoogleLoading(true);
    setError(null);

    signInWithPopup(auth, provider)
      .then(async (cred) => {
        setTokenCookie(await cred.user.getIdToken());
        router.push(redirectTo);
      })
      .catch((err: unknown) => {
        const code =
          err instanceof Error && "code" in err
            ? (err as { code: string }).code
            : "";
        // AC-49: Dismissed popup → silent, no error message
        if (
          code === "auth/popup-closed-by-user" ||
          code === "auth/cancelled-popup-request"
        ) {
          // Return focus to the Google button per AC-46
          googleBtnRef.current?.focus();
          return;
        }
        if (code === "auth/popup-blocked") {
          setError("Popup blocked — try again or use email sign-in");
        } else {
          setError("Google sign-in failed. Please try again.");
        }
        googleBtnRef.current?.focus();
      })
      .finally(() => {
        setGoogleLoading(false);
      });
  };

  return (
    <AuthShell>
      <section
        className="relative overflow-hidden bg-surface rounded-2xl border border-border-strong p-8 w-full max-w-sm shadow-lifted edge-signal"
        aria-labelledby="auth-card-title"
      >
        {/* Logo — mobile only; desktop shows the brand panel */}
        <div className="flex items-center gap-2.5 mb-5 md:hidden">
          <span className="h-6 w-[3px] rounded-full bg-signal" aria-hidden="true" />
          <span className="font-display text-xl tracking-tight text-text-primary">DOOMSTACK</span>
        </div>

        {/* Title */}
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
          [ sign in ]
        </span>
        <h1 id="auth-card-title" className="font-display text-3xl text-text-primary mt-2 mb-1">
          Welcome back
        </h1>
        <p className="text-sm text-text-muted mb-6">Climb back into your stacks.</p>

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

          {/* Email field */}
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

          {/* Password field */}
          <div className="mb-2">
            <label
              htmlFor={passwordId}
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
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

          {/* Forgot password */}
          <div className="flex justify-end mb-6">
            <Link
              href="/auth/reset-password"
              className="text-xs text-text-muted underline hover:text-text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          {/* Primary CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-border-subtle" />
          <span className="text-xs text-text-muted">or continue with</span>
          <div className="flex-1 border-t border-border-subtle" />
        </div>

        {/* Google OAuth button */}
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
        <button
          type="button"
          disabled={guestLoading}
          onClick={() => {
            setGuestLoading(true);
            setError(null);
            signInAnonymously(auth)
              .then(() => router.push(redirectTo))
              .catch(() => setError("Could not sign in as guest. Please try again."))
              .finally(() => setGuestLoading(false));
          }}
          className="w-full mt-3 text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] flex items-center justify-center disabled:opacity-50"
        >
          {guestLoading ? (
            <span className="w-4 h-4 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
          ) : (
            "Continue as guest"
          )}
        </button>

        {/* Toggle to sign up */}
        <p className="text-sm text-text-muted text-center mt-4">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="text-signal hover:underline"
          >
            Sign up
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}

/** Page export — wraps SignInForm in Suspense (required for useSearchParams) */
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-void flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
        </main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
