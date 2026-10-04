import { createPortal } from "react-dom";
import { motion, useIsPresent } from "motion/react";
import { duration, ease } from "../../lib/motionTokens";

/**
 * Full-screen overlay shown while the player is in the matchmaking queue.
 * Portalled to the body so it covers the map and the tab bar (no accidental
 * navigation mid-search), and reads as a game loading / matchmaking screen.
 * Render it under an `AnimatePresence`: it fades in over the map and back out
 * when the search ends.
 */
export function SearchingOverlay({
  status,
  errorMessage,
  onCancel,
  onRetry,
  onDismiss,
}: {
  status: string;
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const present = useIsPresent();
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.fast, ease: ease.out } }}
      exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.in } }}
      inert={!present}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/95 px-6 text-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Matchmaking"
    >
      <p className="sr-only" aria-live="assertive">
        {status === "joining" || status === "searching"
          ? "Searching for an opponent."
          : status === "timeout"
            ? "Search timed out. No opponent found."
            : status === "error" && errorMessage
              ? errorMessage
              : ""}
      </p>

      {(status === "joining" || status === "searching") && (
        <>
          <span
            className="mb-6 inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-border-strong border-t-signal"
            aria-hidden
          />
          <p className="font-display text-xl font-black uppercase tracking-wide text-text-primary">
            Searching for opponent
          </p>
          <p className="mt-2 font-mono text-label uppercase tracking-label text-text-secondary">
            This usually takes a few seconds
          </p>
          <button
            onClick={onCancel}
            className="mt-10 min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
          >
            Cancel
          </button>
        </>
      )}

      {status === "timeout" && (
        <>
          <p className="font-display text-xl font-black uppercase tracking-wide text-text-primary">
            No opponent found
          </p>
          <p className="mt-2 font-mono text-label uppercase tracking-label text-text-secondary">
            Try again or come back later
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={onRetry}
              className="min-h-[48px] w-full rounded-full bg-signal px-8 py-3 font-display text-sm font-black uppercase tracking-wide text-void shadow-signal transition-transform active:scale-[0.97]"
            >
              Search again
            </button>
            <button
              onClick={onDismiss}
              className="min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
            >
              Back
            </button>
          </div>
        </>
      )}

      {status === "error" && (
        <>
          <p className="font-display text-lg font-black uppercase tracking-wide text-ember">
            {errorMessage ?? "Something went wrong"}
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={onRetry}
              className="min-h-[48px] w-full rounded-full bg-signal px-8 py-3 font-display text-sm font-black uppercase tracking-wide text-void shadow-signal transition-transform active:scale-[0.97]"
            >
              Try again
            </button>
            <button
              onClick={onDismiss}
              className="min-h-[48px] rounded-full border border-border-strong px-8 py-3 font-display text-sm font-bold uppercase tracking-wide text-text-secondary transition-transform active:scale-[0.97]"
            >
              Back
            </button>
          </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
}
