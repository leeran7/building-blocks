"use client";

/**
 * InfoDialog — a round icon button that opens its content in a modal.
 *
 * Built on the native <dialog> + showModal(): the browser puts it in the top
 * layer (above the game stage and the sticky navbar), traps focus, closes on
 * Escape and hands focus back to the button. The content is rendered into the
 * page from the start (the dialog is just closed), so server-rendered copy
 * stays crawlable and nothing mounts or measures when it opens.
 *
 * Centered card on wider screens; a bottom sheet on phones. Clicking the
 * backdrop closes it. The button is the same 44px height as a NavTab, so it
 * never changes the height of the tab band it sits in (it narrows to 36px
 * under 360px wide so the band still fits a 320px window).
 */

import { useId, useRef, type ReactNode } from "react";

export function InfoDialog({
  label,
  title,
  icon,
  children,
}: {
  /** Accessible name and tooltip for the trigger button. */
  label: string;
  /** Heading shown at the top of the dialog. */
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-11 w-11 max-[359px]:w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-text-secondary transition-colors hover:border-signal/50 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
      >
        <span className="inline-flex h-5 w-5" aria-hidden="true">
          {icon}
        </span>
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        // A click whose target is the <dialog> itself landed on the backdrop
        // (the content fills the box, so inside clicks hit a child).
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="info-dialog m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-hidden rounded-2xl border border-border-strong bg-surface-raised p-0 text-text-primary shadow-lifted backdrop:bg-void/80 backdrop:backdrop-blur-xs max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-b-0"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-5 py-3">
            <h2 id={titleId} className="flex-1 text-sm font-semibold text-text-primary">
              {title}
            </h2>
            <form method="dialog">
              <button
                type="submit"
                aria-label="Close"
                className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </form>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Game controller, for the Controls & power-ups dialog. */
export function ControlsIcon() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.4 1L15.5 15h-7l-1.4 2a2.5 2.5 0 0 1-4.4-1l-.6-3A5 5 0 0 1 7 7z" />
      <path d="M8 10v3M6.5 11.5h3" />
      <circle cx="15.5" cy="10.5" r="0.6" fill="currentColor" />
      <circle cx="17.5" cy="12.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** Circled "i", for the About dialog. */
export function AboutIcon() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
    </svg>
  );
}
