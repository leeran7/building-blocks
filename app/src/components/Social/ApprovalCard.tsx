"use client";

/**
 * Extracted from approvals/page.tsx (loop/design.md §5.3/§7.2) — per-item
 * error scoping instead of a global banner, `aria-busy`, native `disabled`
 * buttons (kept out of tab order correctly, unlike `aria-disabled` alone).
 */

export interface ApprovalContentItem {
  id: string;
  platform: string;
  title: string | null;
  hook: string | null;
  caption: string | null;
  blockedByAvoidTerm: boolean;
}

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

export function ApprovalCard({
  item,
  acting,
  error,
  onApprove,
  onReject,
}: {
  item: ApprovalContentItem;
  acting: boolean;
  error?: string | null;
  onApprove: () => void;
  onReject: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <article aria-busy={acting} className="space-y-3 rounded-xl border border-border bg-elevated p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs text-text-secondary">{item.platform}</span>
          <h2 className="font-semibold text-text-primary">{item.title ?? item.hook ?? "Untitled"}</h2>
          {item.caption && <p className="mt-1 line-clamp-3 text-sm text-text-secondary">{item.caption}</p>}
          {item.blockedByAvoidTerm && (
            <p className="mt-2 text-xs text-warning">⚠ Contains avoid-listed terms — cannot approve until edited.</p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            disabled={acting || item.blockedByAvoidTerm}
            onClick={onApprove}
            className={`min-h-[36px] rounded-full bg-signal px-4 py-1.5 text-xs font-semibold text-void disabled:opacity-50 ${FOCUS_RING}`}
          >
            {acting ? "…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={onReject}
            className={`min-h-[36px] rounded-full border border-border-strong px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 ${FOCUS_RING}`}
          >
            {acting ? "…" : "Reject"}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
