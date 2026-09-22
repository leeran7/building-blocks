"use client";

import { useState } from "react";
import { PUBLIC_CONFIG } from "../config/public";

type State = "idle" | "loading" | "success" | "error";

/**
 * Beta opt-in banner.
 *
 * `token` is nullable so the banner can paint in the same frame as the rest of
 * the dashboard (whose payload is server-resolved) instead of waiting on the
 * client Firebase session and shifting the layout when it arrives. Only the
 * Join action needs the token, so only that button waits.
 */
export function BetaBanner({ token }: { token: string | null }) {
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
            <span className="text-text-secondary font-normal">tap below to join in TestFlight</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={PUBLIC_CONFIG.testflightUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-signal text-void text-sm font-semibold rounded-lg px-4 min-h-[36px] hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] flex items-center"
          >
            Open TestFlight
          </a>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-text-muted hover:text-text-primary transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
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
        <button
          onClick={handleSubmit}
          disabled={state === "loading" || token === null}
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
