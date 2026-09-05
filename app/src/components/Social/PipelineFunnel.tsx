"use client";

/**
 * Dashboard lifecycle funnel (loop/design.md §4.3/§7.5) — the backbone
 * mental model for the whole admin area, made explicit and clickable.
 */

import Link from "next/link";

export interface PipelineCounts {
  drafting: number;
  inReview: number;
  approved: number;
  scheduled: number;
  published: number;
}

type Tone = "neutral" | "warning" | "signal" | "success";

interface Segment {
  key: keyof PipelineCounts;
  label: string;
  href: string;
  tone: Tone;
}

const SEGMENTS: Segment[] = [
  { key: "drafting", label: "Drafting", href: "/admin/social/content", tone: "neutral" },
  { key: "inReview", label: "In review", href: "/admin/social/approvals", tone: "warning" },
  { key: "approved", label: "Approved", href: "/admin/social/calendar#approved", tone: "signal" },
  { key: "scheduled", label: "Scheduled", href: "/admin/social/calendar", tone: "signal" },
  { key: "published", label: "Published", href: "/admin/social/analytics", tone: "success" },
];

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "text-text-secondary",
  warning: "text-warning",
  signal: "text-signal",
  success: "text-success",
};

export function PipelineFunnel({
  counts,
  loading,
  error,
  onRetry,
}: {
  counts: PipelineCounts | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated p-4 text-sm">
        <span className="text-text-secondary">Couldn&apos;t load pipeline status.</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-primary hover:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {SEGMENTS.map((seg) => {
        const value = counts ? counts[seg.key] : null;
        return (
          <Link
            key={seg.key}
            href={seg.href}
            className="rounded-xl border border-border bg-elevated p-4 transition-colors hover:border-signal/50 focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
          >
            <p className="text-[11px] uppercase tracking-wide text-text-secondary">{seg.label}</p>
            {loading || value === null ? (
              <div className="mt-2 h-8 w-10 rounded bg-elevated/60 animate-pulse motion-reduce:animate-none" />
            ) : (
              <p
                className={`mt-1 font-mono text-2xl tabular-nums ${
                  value === 0 ? "text-text-secondary" : TONE_CLASSES[seg.tone]
                }`}
              >
                {value}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
