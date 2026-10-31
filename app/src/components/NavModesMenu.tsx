"use client";

/**
 * The game modes on a phone, where the navbar hides its 1v1 / Daily / Endless
 * links. Each mode offers Play and its Leaderboard: the game pages are
 * fullscreen on a phone and cover the Leaderboard | Play band, so this is
 * the way to a board.
 *
 * - ModeRows: the rows themselves, used by both navbar dropdowns.
 * - GuestMenu: the signed-out dropdown, built like the signed-in AccountMenu
 *   (same panel): a round hamburger button that folds into an X while open,
 *   then the modes, then Sign in and Get started.
 *   Phones only; from `sm` up the navbar shows the links and the auth buttons.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAME_MODES, SIGNIN_HREF, SIGNUP_HREF, type GameMode } from "./navLinks";

// Colour is added per item, never two text-* utilities on one element (they
// resolve by stylesheet order, not class order).
const ITEM_BASE =
  "flex items-center gap-2.5 rounded-lg px-3 min-h-[44px] text-sm hover:bg-elevated transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal";
const ITEM_MUTED = `${ITEM_BASE} text-text-secondary hover:text-text-primary`;

const ITEM_CURRENT = `${ITEM_BASE} font-semibold bg-signal/10 text-signal`;
const ITEM_PLAIN = `${ITEM_BASE} font-semibold text-text-primary`;

/**
 * The three modes to play, then one Leaderboard link. It opens the current
 * mode's board (Endless off the mode pages); every board carries the
 * Endless | Daily | 1v1 switch, so one link is enough (Leeran).
 *
 * Exactly one row is marked: the page you are on. On a board page that is
 * the Leaderboard row, not the mode (Leeran: "Leaderboard should be
 * highlighted. Not endless.").
 */
export function ModeRows({ active, onPick }: { active: GameMode | null; onPick: () => void }) {
  const pathname = usePathname();
  const board = (GAME_MODES.find((m) => m.mode === active) ?? GAME_MODES.find((m) => m.mode === "endless"))!.board;
  const onBoard = GAME_MODES.some((m) => m.board === pathname);
  return (
    <div role="group" aria-label="Game modes">
      <GroupHeading>Play</GroupHeading>
      {GAME_MODES.map(({ mode, href, label }) => {
        const current = !onBoard && mode === active;
        return (
          <Link
            key={mode}
            href={href}
            aria-current={current ? "true" : undefined}
            onClick={onPick}
            className={current ? ITEM_CURRENT : ITEM_PLAIN}
          >
            {label}
          </Link>
        );
      })}
      <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
      <Link
        href={board}
        aria-current={onBoard ? "true" : undefined}
        onClick={onPick}
        className={onBoard ? ITEM_CURRENT : ITEM_PLAIN}
      >
        Leaderboard
      </Link>
    </div>
  );
}

function GroupHeading({ children }: { children: string }) {
  return (
    <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
      {children}
    </p>
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
        className={
          "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal " +
          (open
            ? "border-signal/60 bg-signal/10 text-signal"
            : "border-border-strong bg-surface/60 text-text-primary hover:border-signal/50")
        }
      >
        {/* Three bars that fold into an X while the menu is open. */}
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path
            d={open ? "M6 6l12 12" : "M4 7h16"}
            className="transition-[d] duration-200 motion-reduce:transition-none"
          />
          <path
            d={open ? "M12 12h0" : "M4 12h16"}
            className="transition-[d,opacity] duration-200 motion-reduce:transition-none"
            opacity={open ? 0 : 1}
          />
          <path
            d={open ? "M18 6L6 18" : "M4 17h16"}
            className="transition-[d] duration-200 motion-reduce:transition-none"
          />
        </svg>
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
