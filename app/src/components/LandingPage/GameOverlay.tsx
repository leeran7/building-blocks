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
import { PlayViewport } from "../Game/PlayViewport";

const ClimbScene = dynamic(
  () => import("../Game/ClimbScene").then((m) => ({ default: m.ClimbScene })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-void" />,
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

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
      className="fixed inset-0 z-50 overflow-hidden bg-void focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${cat.label} climb`}
      tabIndex={-1}
    >
      <PlayViewport>
        <ClimbScene
          tower={tower}
          categoryLabel={cat.label}
          leading={
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[32px] items-center rounded-full px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary hover:text-signal transition-colors focus-visible:outline-none focus-visible:text-signal"
            >
              Close ✕
            </button>
          }
        />
      </PlayViewport>
    </div>
  );
}
