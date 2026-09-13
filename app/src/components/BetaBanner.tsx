"use client";

import { useState } from "react";

type Platform = "ios" | "android" | "any";
type State = "idle" | "loading" | "success" | "error";

export function BetaBanner({ token }: { token: string }) {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [state, setState] = useState<State>("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (state === "success") {
    return (
      <div className="bg-signal/10 border border-signal/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-signal shrink-0" aria-hidden="true" />
          <p className="text-sm text-text-primary font-medium">
            You&apos;re on the list —{" "}
            <span className="text-text-secondary font-normal">check your email for a TestFlight invite</span>
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary transition-colors shrink-0 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/beta/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ platform }),
      });
      if (res.ok) {
        setState("success");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  return (
    <div className="bg-surface border border-border-strong rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-2 h-2 rounded-full bg-signal animate-pulse shrink-0" aria-hidden="true" />
        <p className="text-sm text-text-primary font-medium">
          Native app beta is open —{" "}
          <span className="text-text-secondary font-normal">get early access on your phone</span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Platform toggle */}
        <div
          className="inline-flex items-center rounded-lg border border-border-strong bg-elevated p-0.5 text-xs font-mono"
          role="group"
          aria-label="Platform"
        >
          {(["ios", "android", "any"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={
                "px-2.5 py-1 rounded-md transition-colors uppercase tracking-[0.1em] min-h-[32px] " +
                (platform === p
                  ? "bg-signal text-void font-semibold"
                  : "text-text-muted hover:text-text-primary")
              }
            >
              {p === "any" ? "Both" : p === "ios" ? "iOS" : "Android"}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={state === "loading"}
          className="bg-signal text-void text-sm font-semibold rounded-lg px-4 min-h-[36px] hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {state === "loading" ? (
            <span className="w-3.5 h-3.5 border-2 border-void/30 border-t-void rounded-full animate-spin" />
          ) : (
            "Join beta"
          )}
        </button>

        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {state === "error" && (
        <p role="alert" className="text-xs text-danger w-full">
          Something went wrong — please try again.
        </p>
      )}
    </div>
  );
}
