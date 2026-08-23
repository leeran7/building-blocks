"use client";

/**
 * SharePost — Prefilled share post after payment (AC-34).
 */

interface SharePostProps {
  display_name: string;
  slug: string;
  rank: number | null;
  baseUrl: string;
}

export function SharePost({ display_name, slug, rank, baseUrl }: SharePostProps) {
  const recordUrl = `${baseUrl}/b/${slug}`;
  const text = rank
    ? `I just bought altitude on Tower! ${display_name} is at rank #${rank}. Altitude is permanent — the ground rises instead. ${recordUrl}`
    : `I just listed ${display_name} on Tower! Altitude is permanent — the ground rises instead. ${recordUrl}`;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;

  return (
    <div className="bg-tower-surface border border-tower-border rounded p-4 mb-6">
      <div className="text-xs text-tower-muted uppercase tracking-wider mb-2">
        Share your listing
      </div>
      <p className="text-tower-text text-sm mb-3 leading-relaxed">{text}</p>
      <div className="flex gap-2 flex-wrap">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs bg-sky-900/40 hover:bg-sky-900/60 text-sky-400 px-3 py-1.5 rounded transition-colors"
          aria-label="Share on Twitter/X"
        >
          Share on X
        </a>
        <button
          onClick={() => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }}
          className="text-xs bg-tower-border/40 hover:bg-tower-border/60 text-tower-muted px-3 py-1.5 rounded transition-colors"
          aria-label="Copy share text to clipboard"
        >
          Copy text
        </button>
      </div>
    </div>
  );
}
