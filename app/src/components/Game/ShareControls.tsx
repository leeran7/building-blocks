"use client";

/**
 * Named, 44×44 share controls for X / TikTok / YouTube / Copy link.
 * Labels: text-primary or text-void on signal — not text-muted on void.
 */

import { useCallback, useState } from "react";
import { SHARE_CONTROL_LAYOUT } from "../../share/controlLayout";
import type { ShareAction } from "../../share/types";

const BASE_CLASS = `${SHARE_CONTROL_LAYOUT.className} text-sm font-medium rounded-lg px-3.5 transition`;

const PRIMARY_CLASS = `${BASE_CLASS} bg-signal text-void font-semibold hover:brightness-110`;

const SECONDARY_CLASS = `${BASE_CLASS} border border-border-strong bg-surface/60 text-text-primary hover:border-signal/50 hover:bg-elevated`;

export function ShareControls({
  actions,
  onToast,
}: {
  actions: ShareAction[];
  onToast: (message: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = useCallback(
    async (id: string, text: string, okMessage: string) => {
      try {
        if (!navigator.clipboard) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        onToast(okMessage);
        window.setTimeout(() => setCopiedId(null), 2000);
      } catch {
        onToast("Couldn't copy");
      }
    },
    [onToast]
  );

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {actions.map((action) => {
        if (action.id === "X") {
          if (action.disabled || !action.href) {
            return (
              <button
                key={action.id}
                type="button"
                aria-label={action.label}
                aria-disabled="true"
                onClick={() =>
                  onToast(
                    action.disabledReason === "VALIDATION_ERROR"
                      ? "This replay link is too long to tweet. Save a run to get a short link."
                      : "Sharing on X is not available for this run."
                  )
                }
                className={SECONDARY_CLASS}
              >
                {action.label}
              </button>
            );
          }
          return (
            <a
              key={action.id}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={action.label}
              className={PRIMARY_CLASS}
            >
              {action.label}
            </a>
          );
        }

        const copied = copiedId === action.id;
        const disabled = Boolean(action.disabled) || action.text === "";
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.label}
            aria-disabled={disabled ? "true" : undefined}
            onClick={() => {
              if (disabled) {
                onToast("This caption is too long for that platform.");
                return;
              }
              const ok =
                action.id === "TIKTOK"
                  ? "TikTok caption copied"
                  : action.id === "YOUTUBE"
                    ? "YouTube title and description copied"
                    : "Replay link copied";
              void copyText(action.id, action.text, ok);
            }}
            className={SECONDARY_CLASS}
          >
            {copied ? "Copied!" : action.label}
          </button>
        );
      })}
    </div>
  );
}
