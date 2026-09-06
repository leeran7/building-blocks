"use client";

/**
 * AccountMenu — signed-in account dropdown for the navbar.
 *
 * Groups Creator page · Settings · Sign out (plus Browse / Free climb on
 * mobile, where the navbar hides them). Dashboard stays the navbar pill CTA, so
 * it is intentionally not repeated here. Fetches the user's public username so
 * "Creator page" deep-links to /c/[username] — or to settings when unset.
 * Keyboard + click-outside dismissible.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { FREE_CLIMB_HREF } from "./navLinks";

const ITEM =
  "flex items-center gap-2.5 rounded-lg px-3 min-h-[44px] text-sm text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal";

function initials(name: string): string {
  const parts = name.replace(/^@/, "").trim().split(/[\s._-]+/).filter(Boolean);
  const chars = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (chars || name[0] || "?").toUpperCase();
}

export function AccountMenu() {
  const { user, token, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Fetch the public username once so "My creator page" can deep-link.
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!live) return;
        setUsername(s?.username ?? null);
        setUsernameLoaded(true);
      })
      .catch(() => live && setUsernameLoaded(true));
    return () => {
      live = false;
    };
  }, [token]);

  // Close on click-outside and Escape (returning focus to the trigger).
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

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
  }

  const label = user?.displayName || user?.email || "Account";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account menu"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface/60 pl-1 pr-2 min-h-[44px] hover:border-signal/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated font-mono text-xs font-bold text-text-primary">
          {initials(label)}
        </span>
        <span aria-hidden="true" className="text-text-muted text-xs">
          ▾
        </span>
      </button>

      {/* Disclosure (not a role=menu): items are plain links a user Tabs
          through; open/close via click + Escape + click-outside. */}
      {open && (
        <nav
          id={menuId}
          aria-label="Account"
          className="reveal absolute right-0 mt-2 w-56 rounded-xl border border-border-strong bg-surface-raised shadow-lifted p-1.5"
        >
          {/* Dashboard is the always-visible pill CTA in the navbar; the menu
              covers only what the pill doesn't. Plain nav entry — deep-links to
              the live page once claimed, else to settings. No promo verbiage. */}
          <Link
            href={usernameLoaded && username ? `/c/${username}` : "/settings"}
            className={ITEM}
            onClick={() => setOpen(false)}
          >
            Creator page
          </Link>
          <Link href="/settings" className={ITEM} onClick={() => setOpen(false)}>
            Settings
          </Link>

          {/* Mobile-only: the navbar hides these below sm. */}
          <div className="sm:hidden">
            <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
            <Link href="/#towers" className={ITEM} onClick={() => setOpen(false)}>
              Browse
            </Link>
            <Link href={FREE_CLIMB_HREF} className={ITEM} onClick={() => setOpen(false)}>
              Free climb
            </Link>
          </div>

          <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
          <button
            type="button"
            onClick={handleSignOut}
            className={`${ITEM} w-full text-left hover:text-ember`}
          >
            Sign out
          </button>
        </nav>
      )}
    </div>
  );
}
