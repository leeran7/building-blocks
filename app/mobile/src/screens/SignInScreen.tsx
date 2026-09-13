import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { tapMedium, notifyError } from "../lib/haptics";

type Mode = "options" | "email-signin" | "email-signup";

export function SignInScreen() {
  const navigate = useNavigate();
  const { user, isAnonymous, signInApple, signInGoogle, signInEmail, createAccount, continueGuest } = useAuth();
  const [busy, setBusy] = useState<null | "apple" | "google" | "guest" | "email">(null);

  // Already signed in with a real account — don't show the sign-in screen
  useEffect(() => {
    if (user && !isAnonymous) navigate("/profile", { replace: true });
  }, [user, isAnonymous, navigate]);
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
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Incorrect email or password.");
      } else if (msg.includes("email-already-in-use")) {
        setError("An account with that email already exists.");
      } else if (msg.includes("weak-password")) {
        setError("Password must be at least 6 characters.");
      } else if (msg.includes("invalid-email")) {
        setError("Enter a valid email address.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(null);
    }
  };

  if (mode === "email-signin" || mode === "email-signup") {
    const isSignup = mode === "email-signup";
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-8">
        <button
          onClick={() => { setMode("options"); setError(null); }}
          className="absolute left-6 top-14 font-mono text-xs uppercase tracking-widest text-text-muted"
        >
          ← Back
        </button>

        <h2 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary">
          {isSignup ? "Create Account" : "Sign In"}
        </h2>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-[52px] rounded-2xl border border-border-strong bg-surface px-4 text-base text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[52px] rounded-2xl border border-border-strong bg-surface px-4 text-base text-text-primary placeholder:text-text-muted focus:border-signal focus:outline-none"
          />

          {error && (
            <p role="alert" className="text-sm text-ember">{error}</p>
          )}

          <button
            onClick={run("email", () =>
              isSignup ? createAccount(email, password) : signInEmail(email, password)
            )}
            disabled={busy !== null || !email || !password}
            className="min-h-[52px] rounded-full bg-signal px-6 font-display text-base font-black uppercase tracking-tight text-void transition-transform active:scale-95 disabled:opacity-50"
          >
            {busy === "email" ? "…" : isSignup ? "Create Account" : "Sign In"}
          </button>

          <button
            onClick={() => { setMode(isSignup ? "email-signin" : "email-signup"); setError(null); }}
            className="py-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted underline underline-offset-4"
          >
            {isSignup ? "Already have an account? Sign in" : "No account? Create one"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-5xl font-black uppercase tracking-tight text-text-primary">
          Doom<span className="text-signal">stack</span>
        </h1>
        <p className="max-w-[260px] text-sm text-text-secondary">
          Sign in to save your climbs, rank on the leaderboard, and challenge friends.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <AuthButton
          onClick={run("apple", signInApple)}
          busy={busy === "apple"}
          className="bg-text-primary text-void"
          label="Continue with Apple"
        />
        <AuthButton
          onClick={run("google", signInGoogle)}
          busy={busy === "google"}
          className="border border-border-strong bg-surface text-text-primary"
          label="Continue with Google"
        />
        <AuthButton
          onClick={() => { void tapMedium(); setMode("email-signin"); }}
          busy={false}
          className="border border-border-strong bg-surface text-text-primary"
          label="Sign in with Email"
        />
        <button
          onClick={run("guest", continueGuest)}
          disabled={busy !== null}
          className="mt-1 py-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted underline underline-offset-4 disabled:opacity-50"
        >
          Continue as guest
        </button>
        {error && (
          <p role="alert" className="text-sm text-ember">{error}</p>
        )}
      </div>
    </main>
  );
}

function AuthButton({
  onClick,
  busy,
  className,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  className: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`min-h-[52px] rounded-full px-6 font-display text-base font-bold tracking-tight transition-transform active:scale-95 disabled:opacity-60 ${className}`}
    >
      {busy ? "…" : label}
    </button>
  );
}
