"use client";

/**
 * PendingBlockCard — a just-paid block whose Stripe webhook hasn't revealed it
 * yet (no altitude/rank). A sibling of BlockCard but clearly "in flight" — uses
 * warning amber, never ember (pending is neutral-optimistic, not danger).
 */

import type { CreatorPlatform } from "@prisma/client";
import { SocialMark } from "../Social/SocialMark";
import { PLATFORM_META, handleDisplay } from "../../lib/socialHandle";

export function PendingBlockCard({
  displayName,
  platform,
  handle,
  onRefresh,
}: {
  displayName: string;
  platform: string | null;
  handle: string | null;
  onRefresh: () => void;
}) {
  const p = platform as CreatorPlatform | null;
  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-warning/30 bg-surface p-5 reveal"
      aria-label={`${displayName} — processing`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
          [ processing ]
        </span>
        <span
          className="w-4 h-4 border-2 border-text-muted/30 border-t-warning rounded-full animate-spin"
          aria-hidden="true"
        />
      </div>

      <h2 className="font-display text-xl text-text-primary mt-3 truncate">
        {displayName}
      </h2>
      {p && handle ? (
        <p className="flex items-center gap-1 text-xs font-mono text-text-secondary truncate mt-0.5">
          <SocialMark platform={p} className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">
            {PLATFORM_META[p].label} · {handleDisplay(handle)}
          </span>
        </p>
      ) : null}

      <div
        className="mt-4 h-2 w-full rounded-full bg-surface-raised overflow-hidden"
        aria-hidden="true"
      >
        <div className="h-full w-1/3 bg-warning/40 animate-pulse" />
      </div>

      <p className="text-sm text-text-secondary mt-3" role="status" aria-live="polite">
        Payment confirmed. Your block appears here within a minute.
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-signal transition-colors min-h-[36px]"
      >
        Taking longer? Refresh
      </button>
    </article>
  );
}
