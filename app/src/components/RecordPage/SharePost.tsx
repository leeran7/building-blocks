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
    <div className="bg-surface border border-border-subtle rounded-xl p-4">
      <div className="text-[10px] text-text-muted uppercase tracking-[0.12em] mb-2">
        Share your listing
      </div>
      <p className="text-text-secondary text-sm mb-3 leading-relaxed">{text}</p>
      <div className="flex gap-2 flex-wrap">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium bg-accent text-void hover:brightness-110 px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
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
          className="text-sm font-medium border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
          aria-label="Copy share text to clipboard"
        >
          Copy text
        </button>
      </div>
    </div>
  );
}
