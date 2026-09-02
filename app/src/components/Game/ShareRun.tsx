"use client";

/**
 * ShareRun — share a finished climb replay link (deterministic input log).
 */

import { useCallback, useState } from "react";
import { Toast } from "../Toast";
import { formatAltitude } from "../../lib/units";

interface ShareRunProps {
  peakY: number;
  shareUrl: string | null;
  encoding: boolean;
}

export function ShareRun({ peakY, shareUrl, encoding }: ShareRunProps) {
  const height = Math.round(peakY);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareText = shareUrl
    ? `I climbed ${formatAltitude(height, 0)} on Stack before the lava caught me. Watch the replay: ${shareUrl}`
    : null;

  const tweetUrl =
    shareText &&
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setToast("Replay link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast("Couldn't copy link");
    }
  }, [shareUrl]);

  return (
    <>
      <div className="mt-4 w-full max-w-xs rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 text-center">
        <div className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-1.5">
          Share your run
        </div>
        {encoding ? (
          <p className="text-xs text-text-muted font-mono">Preparing replay…</p>
        ) : shareUrl ? (
          <>
            <p className="text-text-secondary text-xs leading-relaxed mb-3">
              Replay ready — share your{" "}
              <span className="text-signal font-mono tabular-nums">{formatAltitude(height, 0)}</span>{" "}
              climb
            </p>
            <div className="flex gap-2 justify-center">
              {tweetUrl ? (
                <a
                  href={tweetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium bg-accent text-void hover:brightness-110 px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
                  aria-label="Share replay on X"
                >
                  Share on X
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleCopy}
                className="text-sm font-medium border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center min-w-[7.5rem] justify-center"
                aria-label="Copy replay link"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-text-muted leading-relaxed">
            This run was too long to share. Shorter climbs get a replay link
            automatically.
          </p>
        )}
      </div>

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
