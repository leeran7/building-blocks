import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "../ui";
import { tapLight } from "../../lib/haptics";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { SHEET_MOTION_CSS } from "../levels/LevelStartSheet";
import { BoltIcon, SwordsIcon } from "./icons";

/**
 * The mode rail's Versus sheet: the two ways to race another climber, Quick
 * Play (a random opponent) and Challenge (a friend). Each closes the sheet;
 * the matchmaking queue itself lives on the rail, so its overlay outlives it.
 */
export function VersusSheet({
  onQuickPlay,
  onChallenge,
  onClose,
}: {
  onQuickPlay: () => void;
  onChallenge: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);

  useEffect(() => {
    // Hand focus back to the rail button that opened the sheet.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
    // Once per opening: onClose changes identity on every rail render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Portalled to the body: screens sit in a stacking context under the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        ref={scrimRef}
        onClick={onClose}
        className="ls-scrim absolute inset-0 bg-void/70 backdrop-blur-sm"
      />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="versus-sheet-title"
        className="ls-sheet relative w-full max-w-md max-h-[calc(100%-env(safe-area-inset-top)-0.75rem)] overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border-strong bg-surface/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 backdrop-blur-xl"
      >
        <div data-sheet-grabber aria-hidden className="-mx-5 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="versus-sheet-title" className="font-display text-title font-black uppercase tracking-tight text-text-primary">
            Versus
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={() => {
              void tapLight();
              onClose();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-text-secondary transition-transform active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5 pb-2">
          <ModeTile
            icon={<BoltIcon />}
            title="Quick Play"
            subtitle="Find an opponent"
            ariaLabel="Quick play, find a random opponent"
            onPress={onQuickPlay}
          />
          <ModeTile
            icon={<SwordsIcon />}
            title="Challenge"
            subtitle="Race your friends"
            ariaLabel="Challenge a friend to a race"
            onPress={onChallenge}
          />
        </div>
      </section>
      <style>{SHEET_MOTION_CSS}</style>
    </div>,
    document.body,
  );
}

/** Half-width mode tile (Quick Play, Challenge). */
function ModeTile({
  icon,
  title,
  subtitle,
  ariaLabel,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  ariaLabel: string;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      aria-label={ariaLabel}
      className="glass @container w-full min-w-0 rounded-[20px] border border-white/10 py-3 pl-2.5 pr-2 text-left transition-transform active:scale-[0.98] [@media(max-height:640px)]:py-2.5"
    >
      {/* A container query in rem, not a viewport clamp: the icon sits beside the
          text only while the tile is wide enough for its longest line (9.5rem of
          content), so a narrow phone or a large text size stacks it above instead
          of pushing CHALLENGE past the tile edge. */}
      <span className="flex flex-col items-start gap-1.5 @min-[9.5rem]:flex-row @min-[9.5rem]:items-center @min-[9.5rem]:gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-signal/50 bg-signal/10">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-meta font-black uppercase leading-tight tracking-[0.02em] text-text-primary">
            {title}
          </span>
          <span className="mt-0.5 block text-meta leading-snug tracking-[-0.01em] text-text-secondary">
            {subtitle}
          </span>
        </span>
        <ChevronRight size={14} className="hidden text-text-secondary @min-[11rem]:block" />
      </span>
    </button>
  );
}

