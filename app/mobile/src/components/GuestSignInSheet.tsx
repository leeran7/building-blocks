import { useEffect, useId, useRef, useState } from "react";

import { Button } from "./ui";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import { SheetPortal } from "./SheetPortal";

/**
 * A bottom sheet asking a guest to sign in: what an account adds, a Sign in
 * button and a way to keep playing. Used where the guest taster ends (a level
 * above the cap) and once after the guest's third Endless run.
 *
 * Portalled to the body, like LevelStartSheet, so no screen's stacking
 * context clips it.
 */
export function GuestSignInSheet({
  eyebrow,
  title,
  body,
  onSignIn,
  onClose,
}: {
  eyebrow: string;
  title: string;
  body: string;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  useSwipeToDismiss(sheetRef, onClose, scrimRef);
  // Read before Sign in takes focus (autoFocus runs before effects), so
  // closing hands focus back to whatever opened the sheet.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
    // Once per opening: onClose changes identity on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SheetPortal
      scrim={
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          ref={scrimRef}
          onClick={onClose}
          className="absolute inset-0 bg-void/70 backdrop-blur-sm"
        />
      }
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-guest-sign-in
        className="relative w-full max-w-md rounded-t-[28px] border-t border-border-strong bg-surface/95 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2 backdrop-blur-xl"
      >
        <div data-sheet-grabber aria-hidden className="-mx-6 -mt-2 flex h-5 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <p className="mt-3 font-mono text-label font-bold uppercase tracking-eyebrow text-signal">{eyebrow}</p>
        <h2 id={titleId} className="mt-2 font-display text-title font-black uppercase leading-none tracking-tight text-text-primary">
          {title}
        </h2>
        <p id={bodyId} className="mt-3 text-body text-text-secondary">
          {body}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button autoFocus onPress={onSignIn} className="min-h-[56px] text-cta">
            Sign in
          </Button>
          <Button variant="ghost" onPress={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </SheetPortal>
  );
}
