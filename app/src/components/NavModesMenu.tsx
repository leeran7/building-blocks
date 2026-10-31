"use client";

/**
 * The game modes on a phone, where the navbar hides its 1v1 / Daily / Endless
 * links. Each mode offers Play and its Leaderboard: the game pages are
 * fullscreen on a phone and cover the Leaderboard | Play band, so this is
 * the way to a board.
 *
 * - ModeRows: the rows themselves, used by both navbar dropdowns.
 * - GuestMenu: the signed-out dropdown, built like the signed-in AccountMenu
 *   (same trigger shape, same panel): the modes, then Sign in and Get started.
 *   Phones only; from `sm` up the navbar shows the links and the auth buttons.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { GAME_MODES, SIGNIN_HREF, SIGNUP_HREF, type GameMode } from "./navLinks";

// Colour is added per item, never two text-* utilities on one element (they
// resolve by stylesheet order, not class order).
const ITEM_BASE =
  "flex items-center gap-2.5 rounded-lg px-3 min-h-[44px] text-sm hover:bg-elevated transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal";
const ITEM_MUTED = `${ITEM_BASE} text-text-secondary hover:text-text-primary`;

/** One row per mode: its name (Play) and its Leaderboard. */
export function ModeRows({ active, onPick }: { active: GameMode | null; onPick: () => void }) {
  return (
    <div role="group" aria-label="Game modes">
      <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
        Modes
      </p>
      {GAME_MODES.map(({ mode, href, board, label }) => (
        <div key={mode} className={"flex items-center rounded-lg " + (mode === active ? "bg-signal/10" : "")}>
          <Link
            href={href}
            aria-current={mode === active ? "true" : undefined}
            onClick={onPick}
            className={`${ITEM_BASE} flex-1 font-semibold ${mode === active ? "text-signal" : "text-text-primary"}`}
          >
            {label}
          </Link>
          <Link href={board} aria-label={`${label} leaderboard`} onClick={onPick} className={ITEM_MUTED}>
            Leaderboard
          </Link>
        </div>
      ))}
    </div>
  );
}

/** Close on a press outside the root and on Escape (focus back to the trigger). */
export function useDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  rootRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
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
  }, [open, setOpen, rootRef, triggerRef]);
}

export function GuestMenu({ activeMode }: { activeMode: GameMode | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useDismiss(open, setOpen, rootRef, triggerRef);
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Menu"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface/60 pl-1 pr-2 min-h-[44px] hover:border-signal/50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-text-primary">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </span>
        <span aria-hidden="true" className="text-text-muted text-xs">
          ▾
        </span>
      </button>

      {open && (
        <nav
          id={menuId}
          aria-label="Menu"
          data-entrance="live"
          className="reveal absolute right-0 mt-2 w-64 rounded-xl border border-border-strong bg-surface-raised shadow-lifted p-1.5"
        >
          <ModeRows active={activeMode} onPick={close} />
          <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
          <Link href={SIGNIN_HREF} className={ITEM_MUTED} onClick={close}>
            Sign in
          </Link>
          <Link href={SIGNUP_HREF} className={`${ITEM_BASE} font-semibold text-signal`} onClick={close}>
            Get started
          </Link>
        </nav>
      )}
    </div>
  );
}
