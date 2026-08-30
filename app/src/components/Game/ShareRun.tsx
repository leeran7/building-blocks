"use client";

/**
 * ShareRun — share a finished climb replay link (deterministic input log).
 */

interface ShareRunProps {
  peakY: number;
  shareUrl: string | null;
  encoding: boolean;
}

export function ShareRun({ peakY, shareUrl, encoding }: ShareRunProps) {
  const height = Math.round(peakY);
  const text = shareUrl
    ? `I climbed ${height}m on Stack before the lava caught me. Watch the replay: ${shareUrl}`
    : null;

  const tweetUrl =
    text &&
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  return (
    <div className="mt-4 w-full max-w-sm rounded-xl border border-border-subtle bg-surface/80 p-4 text-left">
      <div className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-2">
        Share your run
      </div>
      {encoding ? (
        <p className="text-xs text-text-muted font-mono">Preparing replay link…</p>
      ) : shareUrl ? (
        <>
          <p className="text-text-secondary text-xs mb-3 leading-relaxed break-all">
            {shareUrl}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
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
              onClick={() => {
                if (shareUrl && navigator.clipboard) {
                  navigator.clipboard.writeText(shareUrl).catch(() => {});
                }
              }}
              className="text-sm font-medium border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
              aria-label="Copy replay link"
            >
              Copy link
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-text-muted">
          This run was too long to pack into a share link. Shorter climbs can be
          shared automatically.
        </p>
      )}
    </div>
  );
}
