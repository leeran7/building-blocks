import type { ReactNode, Ref } from "react";

/**
 * A small live status pill under the title (Ranks: the reset countdown or the
 * climber count). Plain text, never a live region: it may change every minute
 * and must not announce each change. The visible text is hidden from assistive
 * tech and `label` is read instead, so "6h 36m" can be spoken as words.
 */
export interface HubStatus {
  /** Decorative glyph before the text; rendered aria-hidden. */
  icon: ReactNode;
  /** Visible copy. One short line: the pill never wraps. */
  text: string;
  /** What a screen reader reads in place of `text`. */
  label: string;
}

export interface HubHeaderProps {
  /** The page title, and the screen's single h1. */
  title: string;
  /** Tracked mono line under the title. The header draws the dot between segments. */
  subtitle?: readonly string[];
  /** Decorative icon beside the title (Ranks: the trophy). Mark it aria-hidden. */
  trailing?: ReactNode;
  /** Makes the title a programmatic focus target (tabIndex -1), e.g. useRetry's focusOnRecover. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Status pill under the title. Independent of `subtitle`; Profile passes only a subtitle. */
  status?: HubStatus;
}

/**
 * Centered header for the tab-bar hub screens (Ranks, Profile): the lime
 * DOOMSTACK eyebrow between two rules, the metal page title, and an optional
 * subtitle and/or status pill. One component so the hub headers cannot drift apart. Pushed
 * screens with a back button use PushHeader. Home is the title screen and has
 * its own wordmark.
 */
export function HubHeader({ title, subtitle, trailing, headingRef, status }: HubHeaderProps) {
  return (
    <header className="flex flex-col items-center pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] text-center">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-signal/70" />
        <span className="pl-(--tracking-eyebrow) font-mono text-label font-bold uppercase tracking-eyebrow text-signal">
          Doomstack
        </span>
        <span aria-hidden className="h-px w-8 bg-signal/70" />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="metal-title font-display text-title font-black uppercase tracking-[-0.02em] focus:outline-none"
        >
          {title}
        </h1>
        {trailing}
      </div>
      {subtitle && subtitle.length > 0 && (
        <p className="mt-2 flex items-center gap-2 font-mono text-label uppercase tracking-label text-text-muted">
          {subtitle.map((part, i) => (
            <SubtitlePart key={i} part={part} first={i === 0} />
          ))}
        </p>
      )}
      {status && <StatusPill status={status} />}
    </header>
  );
}

function SubtitlePart({ part, first }: { part: string; first: boolean }) {
  return (
    <>
      {!first && <span aria-hidden className="h-1 w-1 rounded-full bg-text-muted" />}
      <span>{part}</span>
    </>
  );
}

/**
 * Fixed height (h-8, rem so it scales with text size) and no wrapping, so a
 * change of copy between tabs changes only the pill's width, never the
 * layout below it. The longest copy fits one line at 320pt.
 */
function StatusPill({ status }: { status: HubStatus }) {
  return (
    <p
      data-hub-status=""
      className="glass mt-3 inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 px-3 font-sans text-meta font-medium leading-none text-text-secondary"
    >
      <span aria-hidden className="flex shrink-0 text-signal">
        {status.icon}
      </span>
      <span aria-hidden className="tabular-nums">
        {status.text}
      </span>
      <span className="sr-only">{status.label}</span>
    </p>
  );
}
