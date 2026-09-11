"use client";

/**
 * AccountMenu — signed-in account dropdown for the navbar.
 *
 * Groups Dashboard · Creator page · Settings · Sign out (plus Browse / Free
 * climb on mobile, where the navbar hides them). Fetches the user's public
 * username so "Creator page" deep-links to /c/[username] — shown only once a
 * username is claimed. When paid features are on, also shows the chip
 * balance and a daily-chip-claim button. Keyboard + click-outside dismissible.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { FREE_CLIMB_HREF, DUEL_HREF } from "./navLinks";
import { PAID_DUELS_ENABLED_PUBLIC } from "../config/paidDuel";
import { useClaimDailyChips } from "../hooks/useClaimDailyChips";

const ITEM =
  "flex items-center gap-2.5 rounded-lg px-3 min-h-[44px] text-sm text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal";

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
  const [walletBalance, setWalletBalance] = useState<{
    playCents: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { state: claimState, claim } = useClaimDailyChips(token);

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

  // Fetch wallet balance when the menu opens, and again after a successful
  // daily-chip claim so the displayed balance stays current.
  useEffect(() => {
    if (!open || !token || !PAID_DUELS_ENABLED_PUBLIC) return;
    let live = true;
    fetch("/api/wallet", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { playCents: number } | null) => {
        if (!live || !data) return;
        setWalletBalance({ playCents: data.playCents });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, token, claimState.status]);

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
        className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface/60 pl-1 pr-2 min-h-[44px] hover:border-signal/50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal"
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
          {/* Chip balance — display-only, shown when paid features are on */}
          {PAID_DUELS_ENABLED_PUBLIC && walletBalance && (
            <>
              <div className="px-3 pt-1.5 pb-2">
                <p className="font-mono text-[11px] tabular-nums text-signal font-semibold">
                  {(walletBalance.playCents / 100).toLocaleString()} chips
                </p>
              </div>
              <button
                type="button"
                onClick={claim}
                disabled={
                  claimState.status === "claiming" ||
                  claimState.status === "claimed" ||
                  claimState.status === "already-claimed"
                }
                className={`${ITEM} w-full text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                {claimState.status === "claiming"
                  ? "Claiming..."
                  : claimState.status === "claimed"
                    ? "Claimed daily chips"
                    : claimState.status === "already-claimed"
                      ? "Already claimed today"
                      : "Claim daily chips"}
              </button>
              {claimState.status === "error" && (
                <p className="px-3 py-1 text-xs text-ember" role="alert">{claimState.message}</p>
              )}
              <div className="my-1 border-t border-border-subtle" aria-hidden="true" />
            </>
          )}
          <Link href="/dashboard" className={ITEM} onClick={() => setOpen(false)}>
            Dashboard
          </Link>
          {/* Creator page is a plain deep-link, shown only once a username is
              claimed. No promo verbiage; setup lives in the post-payment card. */}
          {usernameLoaded && username && (
            <Link
              href={`/c/${username}`}
              className={ITEM}
              onClick={() => setOpen(false)}
            >
              Creator page
            </Link>
          )}

          <Link href="/settings" className={ITEM} onClick={() => setOpen(false)}>
            Settings
          </Link>

          {/* Mobile-only: the navbar hides these below sm. */}
          <div className="sm:hidden">
            <div className="my-1.5 border-t border-border-subtle" aria-hidden="true" />
            <Link href={DUEL_HREF} className={ITEM} onClick={() => setOpen(false)}>
              1v1
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
