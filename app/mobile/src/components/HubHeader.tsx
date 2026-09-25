import type { ReactNode, Ref } from "react";

export interface HubHeaderProps {
  /** The page title, and the screen's single h1. */
  title: string;
  /** Tracked mono line under the title. The header draws the dot between segments. */
  subtitle?: readonly string[];
  /** Decorative icon beside the title (Ranks: the trophy). Mark it aria-hidden. */
  trailing?: ReactNode;
  /** Makes the title a programmatic focus target (tabIndex -1), e.g. useRetry's focusOnRecover. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * Centered header for the tab-bar hub screens (Ranks, Profile): the lime
 * DOOMSTACK eyebrow between two rules, the metal page title, and an optional
 * subtitle. One component so the hub headers cannot drift apart. Pushed
 * screens with a back button use PushHeader. Home is the title screen and has
 * its own wordmark.
 */
export function HubHeader({ title, subtitle, trailing, headingRef }: HubHeaderProps) {
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
