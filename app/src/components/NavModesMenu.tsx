"use client";

/**
 * NavModesMenu — the navbar's game modes (1v1, Daily, Endless) on a phone.
 *
 * Below `sm` the navbar has no room for the three mode links, so they sit
 * behind one labelled button: it names the mode you are in ("Daily ▾"), or
 * says "Modes ▾" off the mode pages. It renders for everyone, signed in or
 * not; a signed-out visitor on a phone used to have no way to reach another
 * mode from the navbar at all.
 *
 * A disclosure, like AccountMenu: plain links, closed by a pick, Escape
 * (focus back to the button) or a press outside.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { GameMode } from "./navLinks";

export interface NavMode {
  mode: GameMode;
  href: string;
  label: string;
}

const ITEM =
  "flex items-center justify-between gap-2.5 rounded-lg px-3 min-h-[44px] text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal";

export function NavModesMenu({ modes, active }: { modes: readonly NavMode[]; active: GameMode | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = modes.find((m) => m.mode === active);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={current ? `Game modes, now ${current.label}` : "Game modes"}
        className={
          "inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap px-2 font-mono text-xs uppercase tracking-[0.14em] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal rounded-full " +
          (current ? "text-signal" : "text-text-secondary hover:text-text-primary")
        }
      >
        {current?.label ?? "Modes"}
        <span aria-hidden="true" className="text-text-muted">
          ▾
        </span>
      </button>

      {open && (
        <nav
          id={menuId}
          aria-label="Game modes"
          data-entrance="live"
          className="reveal absolute left-0 mt-2 w-48 rounded-xl border border-border-strong bg-surface-raised p-1.5 shadow-lifted"
        >
          {modes.map(({ mode, href, label }) => (
            <Link
              key={mode}
              href={href}
              aria-current={mode === active ? "true" : undefined}
              onClick={() => setOpen(false)}
              className={
                `${ITEM} ` +
                (mode === active
                  ? "text-signal bg-signal/10"
                  : "text-text-secondary hover:bg-elevated hover:text-text-primary")
              }
            >
              {label}
              {mode === active ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">You&rsquo;re here</span>
              ) : null}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
