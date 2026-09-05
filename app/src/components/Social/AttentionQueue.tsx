"use client";

/**
 * Merged, priority-ordered "needs your attention" list (loop/design.md
 * §4.4/§7.1) — the Dashboard's direct answer to "what do I do next."
 */

import Link from "next/link";

export type AttentionTone = "warning" | "danger" | "signal";

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  icon: string;
  label: string;
  href: string;
}

const TONE_TEXT: Record<AttentionTone, string> = {
  warning: "text-warning",
  danger: "text-danger",
  signal: "text-signal",
};

export function AttentionQueue({
  items,
  loading,
  error,
  onRetry,
}: {
  items: AttentionItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-elevated p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-text-primary">Needs your attention</h2>
        {!loading && !error && (
          <span className="text-xs text-text-secondary">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-11 rounded-lg bg-elevated/60 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-text-secondary">
            <span className="text-danger" aria-hidden="true">
              ✕
            </span>
            Couldn&apos;t load your status.
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-primary hover:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="text-success" aria-hidden="true">
            ✓
          </span>
          You&apos;re caught up. Nothing needs review, scheduling, or reconnecting.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <AttentionRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-elevated/60 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
      >
        <span className="flex items-center gap-2 text-sm text-text-primary">
          <span className={TONE_TEXT[item.tone]} aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </span>
        <span className="text-text-secondary" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
