"use client";

/**
 * GameOverlay — plays the climb without leaving the landing page.
 *
 * A fullscreen, scroll-locked, focus-trapped modal over the current page. Keeps
 * the "single page" model while giving the keyboard canvas a dedicated surface
 * (so space-to-jump doesn't fight page scroll). The tower is built client-side
 * from the slug (buildTower is pure), and ClimbScene is lazy-loaded so it never
 * weighs down the initial landing bundle. Esc or the close button dismisses it.
 */

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { resolveGameCategory } from "../../game/categories";
import { buildTower } from "../../game/towers";

const ClimbScene = dynamic(
  () => import("../Game/ClimbScene").then((m) => ({ default: m.ClimbScene })),
  {
    ssr: false,
    loading: () => (
      <div className="w-[min(92vw,500px)] h-[min(85vh,820px)] rounded-2xl bg-surface-raised animate-pulse" />
    ),
  }
);

export function GameOverlay({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const cat = resolveGameCategory(slug);
  const tower = buildTower(cat);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Remember what had focus so we can restore it on close (WCAG 2.4.3).
    const trigger = document.activeElement as HTMLElement | null;
    // Move focus into the dialog on open.
    closeButtonRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Trap Tab within the dialog.
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !dialog.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      // Restore focus to the element that opened the overlay.
      trigger?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`${cat.label} climb`}
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close climb"
        onClick={onClose}
        className="absolute inset-0 bg-void/85 backdrop-blur-sm"
      />

      {/* header */}
      <header className="relative flex items-center justify-between px-4 md:px-6 h-14 border-b border-border-subtle bg-void/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-6 w-[3px] rounded-full bg-signal" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-secondary truncate">
            {cat.label} climb · {cat.family}
          </span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-text-secondary hover:text-signal transition-colors min-h-[40px] px-2 focus-visible:outline-none focus-visible:text-signal"
        >
          Close ✕
        </button>
      </header>

      {/* stage */}
      <div className="relative flex-1 overflow-auto grid place-items-center p-4">
        <ClimbScene tower={tower} categoryLabel={cat.label} />
      </div>
    </div>
  );
}
