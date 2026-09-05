"use client";

/**
 * Replaces `window.prompt()` for the rejection reason (loop/design.md
 * §5.3/§7.2) — a styled, focus-trapped, Escape-to-close modal. Focus return
 * to the triggering button is the caller's responsibility (it owns the
 * trigger element), invoked from `onCancel`/after a successful confirm.
 */

import { useEffect, useRef, useState } from "react";

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

export function RejectDialog({
  open,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      textareaRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-dialog-title"
        className="w-full max-w-sm space-y-4 rounded-xl border border-border-strong bg-elevated p-5"
      >
        <h2 id="reject-dialog-title" className="text-sm font-semibold text-text-primary">
          Reject this draft?
        </h2>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          className={`w-full rounded-lg border border-border bg-void px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none ${FOCUS_RING}`}
        />
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`min-h-[36px] rounded-full border border-border-strong px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={submitting}
            className={`min-h-[36px] rounded-full border border-danger px-4 py-1.5 text-xs font-semibold text-danger disabled:opacity-50 ${FOCUS_RING}`}
          >
            {submitting ? "…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
