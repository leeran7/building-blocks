"use client";

/**
 * NavbarAuth -- client island for the auth-dependent section of the Navbar.
 *
 * Renders the loading skeleton, the signed-in AccountMenu, or the
 * signed-out controls depending on auth state. On mobile, signed-out users
 * get the same "menu button for links" pattern as signed-in users
 * (AccountMenu's avatar): a hamburger disclosure holds 1v1 / Free climb /
 * Get started, and the only control shown outside it is Sign in. Extracted
 * so the Navbar shell (logo, static nav links) can remain a server
 * component.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { AccountMenu } from "./AccountMenu";
import { SIGNIN_HREF, SIGNUP_HREF, DUEL_HREF, FREE_CLIMB_HREF } from "./navLinks";

const PILL =
  "inline-flex items-center justify-center rounded-full px-4 min-h-[38px] text-sm font-semibold tracking-tight transition-[filter,transform,scale] hover:brightness-110 active:scale-[0.98] focus-visible:outline-hidden";
const GHOST =
  "inline-flex items-center justify-center px-3 min-h-[38px] font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors";
const ITEM =
  "flex items-center gap-2.5 rounded-lg px-3 min-h-[44px] text-sm text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal";

/** Mobile-only disclosure for 1v1 / Free climb / Get started (signed-out). */
function MobileLinksMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
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
        aria-label="Menu"
        className="inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-elevated transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal"
      >
        <span aria-hidden="true" className="text-text-secondary text-base leading-none">
          ☰
        </span>
      </button>

      {open && (
        <nav
          id={menuId}
          aria-label="Links"
          className="reveal absolute right-0 mt-2 w-48 rounded-xl border border-border-strong bg-surface-raised shadow-lifted p-1.5"
        >
          <Link href={DUEL_HREF} className={ITEM} onClick={() => setOpen(false)}>
            1v1
          </Link>
          <Link href={FREE_CLIMB_HREF} className={ITEM} onClick={() => setOpen(false)}>
            Free climb
          </Link>
          <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
          <Link href={SIGNUP_HREF} className={ITEM} onClick={() => setOpen(false)}>
            Get started
          </Link>
        </nav>
      )}
    </div>
  );
}

export function NavbarAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="h-9 w-40 rounded-full bg-elevated animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (user) {
    return <AccountMenu />;
  }

  return (
    <>
      <MobileLinksMenu />
      <Link href={SIGNIN_HREF} className={GHOST}>
        Sign in
      </Link>
      <Link href={SIGNUP_HREF} className={`${PILL} bg-signal text-void hidden sm:inline-flex`}>
        Get started
      </Link>
    </>
  );
}
