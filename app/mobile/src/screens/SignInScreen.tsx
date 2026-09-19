import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { tapMedium, notifyError } from "../lib/haptics";
import { Button } from "../components/ui";
import { LogoMark } from "../components/LogoMark";

type Mode = "options" | "email-signin" | "email-signup";

export function SignInScreen({ onGuestContinue }: { onGuestContinue?: () => void } = {}) {
  const navigate = useNavigate();
  // This screen is only ever rendered by the auth gate for signed-out users;
  // once a real account signs in, the gate swaps to the app automatically.
  const { signInApple, signInGoogle, signInEmail, createAccount } = useAuth();
  const [busy, setBusy] = useState<null | "apple" | "google" | "email">(null);
  const [mode, setMode] = useState<Mode>("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (kind: typeof busy, fn: () => Promise<void>) => async () => {
    void tapMedium();
    setError(null);
    setBusy(kind);
    try {
      await fn();
      navigate("/");
    } catch (e: unknown) {
      void notifyError();
      // Capacitor Firebase plugin surfaces the error code on a `.code` property
      // (e.g. "auth/email-already-in-use") rather than embedding it in the message
      // string like the web SDK does — check both so one handler covers all platforms.
      const code = (e as Record<string, unknown>)?.code as string ?? "";
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const haystack = `${code} ${msg}`;
      if (haystack.includes("wrong-password") || haystack.includes("invalid-credential")) {
        setError("Incorrect email or password.");
      } else if (haystack.includes("email-already-in-use")) {
        setError("An account with that email already exists.");
      } else if (haystack.includes("weak-password")) {
        setError("Password must be at least 6 characters.");
      } else if (haystack.includes("invalid-email")) {
        setError("Enter a valid email address.");
      } else if (haystack.includes("operation-not-allowed")) {
        setError("Email sign-in is not enabled — contact support.");
      } else if (haystack.includes("network") || haystack.includes("network-request-failed")) {
        setError("Network error — check your connection and try again.");
      } else {
        setError("Something went wrong. Try again.");
        console.error("[auth] unhandled error:", e);
      }
    } finally {
      setBusy(null);
    }
  };

  if (mode === "email-signin" || mode === "email-signup") {
    const isSignup = mode === "email-signup";
    return (
      <main className="app-fade flex h-[100dvh] flex-col px-8 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
        <button
          onClick={() => { setMode("options"); setError(null); }}
          className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted transition-transform active:scale-95"
        >
          ← Back
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-text-muted">
              {isSignup ? "join the climb" : "welcome back"}
            </span>
            <h2 className="font-display text-2xl font-black uppercase tracking-tight text-text-primary">
              {isSignup ? "Create Account" : "Sign In"}
            </h2>
          </div>

          <div className="flex w-full max-w-xs flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              className="min-h-[52px] rounded-2xl border border-border-strong bg-surface px-4 text-base text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="min-h-[52px] rounded-2xl border border-border-strong bg-surface px-4 text-base text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
            />

            {error && (
              <p role="alert" className="text-sm text-ember">{error}</p>
            )}

            <Button
              onPress={run("email", () =>
                isSignup ? createAccount(email, password) : signInEmail(email, password)
              )}
              busy={busy === "email"}
              disabled={busy !== null || !email || !password}
            >
              {isSignup ? "Create Account" : "Sign In"}
            </Button>

            <Button
              variant="secondary"
              onPress={() => { setMode(isSignup ? "email-signin" : "email-signup"); setError(null); }}
            >
              {isSignup ? "Have an account? Sign in" : "Create account"}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-fade flex h-[100dvh] flex-col items-center justify-center gap-10 px-8 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+2rem)] text-center">
      <div className="flex flex-col items-center gap-3">
        <LogoMark size={72} card className="mb-2" />
        <span className="font-mono text-[10px] uppercase tracking-[0.5em] text-text-muted">
          endless&nbsp;climb
        </span>
        <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-text-primary">
          Doom<span className="text-signal">stack</span>
        </h1>
        <p className="max-w-[270px] text-sm leading-relaxed text-text-secondary">
          Sign in to save your climbs, rank on the leaderboard, and challenge
          friends.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          onPress={run("apple", signInApple)}
          busy={busy === "apple"}
          disabled={busy !== null}
          variant="secondary"
          className="border-transparent bg-text-primary text-void"
        >
          <AppleGlyph />
          Continue with Apple
        </Button>
        <Button
          onPress={run("google", signInGoogle)}
          busy={busy === "google"}
          disabled={busy !== null}
          variant="secondary"
        >
          <GoogleGlyph />
          Continue with Google
        </Button>
        <Button
          onPress={() => { void tapMedium(); setMode("email-signin"); }}
          variant="secondary"
        >
          <MailGlyph />
          Sign in with Email
        </Button>
        {error && (
          <p role="alert" className="text-sm text-ember">{error}</p>
        )}
      </div>

      {onGuestContinue && (
        <button
          onClick={() => { void tapMedium(); onGuestContinue(); }}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white underline underline-offset-2 transition-colors active:text-white/70"
        >
          Continue as Guest
        </button>
      )}
    </main>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.54c-.02-2.06 1.68-3.05 1.76-3.1-0.96-1.4-2.45-1.6-2.98-1.62-1.27-.13-2.48.75-3.12.75-.64 0-1.64-.73-2.7-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69.99 1.51 2.1 2.58 2.06 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.61.67 2.7.65 1.12-.02 1.82-1.01 2.5-2.01.79-1.15 1.11-2.27 1.13-2.33-.02-.01-2.17-.83-2.19-3.3zM15 6.38c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.24-.53.61-.99 1.59-.87 2.52.91.07 1.85-.46 2.42-1.16z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.24c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.32v2.76h3.54c2.08-1.92 3.25-4.74 3.25-8.11z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.54-2.76c-.98.66-2.24 1.06-3.74 1.06-2.87 0-5.3-1.94-6.17-4.55H2.18v2.85A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.65-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05L5.83 9.9C6.7 7.29 9.13 5.38 12 5.38z" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
