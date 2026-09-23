"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../src/contexts/AuthContext";
import { PUBLIC_CONFIG } from "../../src/config/public";

type State = "idle" | "loading" | "success" | "alreadyJoined" | "error";

export default function BetaPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [state, setState] = useState<State>("idle");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setState("loading");
    try {
      const res = await fetch("/api/beta/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) { setState("error"); return; }
      const data = await res.json() as { joined?: boolean; alreadyJoined?: boolean };
      setState(data.alreadyJoined ? "alreadyJoined" : "success");
    } catch {
      setState("error");
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-void flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-text-muted/30 border-t-signal rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="grain min-h-screen bg-void flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="relative overflow-hidden bg-surface rounded-2xl border border-border-strong p-8 shadow-lifted edge-signal">
          {/* header */}
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
            [ native app ]
          </span>
          <h1 className="font-display text-3xl text-text-primary mt-2 mb-1">
            Join the beta
          </h1>
          <p className="text-sm text-text-muted mb-6">
            Get early access to the Doomstack iOS app.
          </p>

          {/* success */}
          {(state === "success" || state === "alreadyJoined") && (
            <div className="bg-signal/10 border border-signal/30 rounded-xl p-4 text-center">
              <p className="text-signal font-semibold mb-1">
                {state === "alreadyJoined" ? "You're already on the list" : "You're in!"}
              </p>
              <p className="text-sm text-text-secondary mb-4">
                Tap below to get Doomstack on the App Store.
              </p>
              <a
                href={PUBLIC_CONFIG.appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-signal text-void font-semibold rounded-lg py-3 text-base text-center hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] min-h-[44px]"
              >
                View on the App Store →
              </a>
              <Link
                href="/dashboard"
                className="inline-block mt-4 text-sm text-signal underline-offset-4 hover:underline"
              >
                Back to dashboard →
              </Link>
            </div>
          )}

          {/* not signed in */}
          {!user && state !== "success" && state !== "alreadyJoined" && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                You need a Doomstack account to join the beta.
              </p>
              <Link
                href="/auth/signup?redirect=/beta"
                className="block w-full bg-signal text-void font-semibold rounded-lg py-3 text-base text-center hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] min-h-[44px]"
              >
                Create account →
              </Link>
              <Link
                href="/auth/signin?redirect=/beta"
                className="block w-full text-center text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] flex items-center justify-center"
              >
                Already have an account? Sign in
              </Link>
            </div>
          )}

          {/* form */}
          {user && state !== "success" && state !== "alreadyJoined" && (
            <form onSubmit={handleSubmit}>
              {state === "error" && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="text-sm text-danger mb-4 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2"
                >
                  Something went wrong — please try again.
                </div>
              )}

              <p className="text-sm text-text-secondary mb-5">
                Get an invite to the Doomstack iOS beta on TestFlight.
              </p>

              <button
                type="submit"
                disabled={state === "loading"}
                className="w-full bg-signal text-void font-semibold rounded-lg py-3 text-base transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
              >
                {state === "loading" ? (
                  <>
                    <span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />
                    Joining…
                  </>
                ) : (
                  "Join beta →"
                )}
              </button>

              <p className="text-xs text-text-muted text-center mt-4">
                Signed in as{" "}
                <span className="text-text-secondary">{user.email}</span>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
