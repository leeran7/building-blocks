"use client";

/**
 * FullscreenButton — desktop affordance to play the climb stage full screen.
 *
 * Rendered inside the canvas box (top-right). Touch devices already run the
 * game as a full-bleed `fixed inset-0` stage, so the caller only mounts this on
 * pointer-fine devices where the canvas is otherwise a framed column.
 */

export function FullscreenButton({
  isFullscreen,
  onToggle,
  className,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-game-control
      onClick={onToggle}
      aria-label={isFullscreen ? "Exit full screen" : "Play full screen"}
      title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-void/70 text-text-secondary backdrop-blur-xs transition-colors hover:border-signal/50 hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (className ?? "")
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {isFullscreen ? (
          // Inward arrows — collapse.
          <>
            <path d="M9 4v5H4" />
            <path d="M15 4v5h5" />
            <path d="M9 20v-5H4" />
            <path d="M15 20v-5h5" />
          </>
        ) : (
          // Outward corners — expand.
          <>
            <path d="M4 9V4h5" />
            <path d="M20 9V4h-5" />
            <path d="M4 15v5h5" />
            <path d="M20 15v5h-5" />
          </>
        )}
      </svg>
    </button>
  );
}
