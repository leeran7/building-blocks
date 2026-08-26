"use client";

/**
 * Navbar — shared, auth-aware top navigation (ASCENT design).
 *
 * Reads as an instrument header: wide display wordmark preceded by an altimeter
 * tick, mono/uppercase nav labels, and a signal-lime pill CTA. Auth behaviour is
 * unchanged — signed-in users get Dashboard + Sign out; signed-out get Sign in +
 * Get started. A stable skeleton renders while auth resolves (no wrong-state flash).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

interface NavbarProps {
  /** Optional breadcrumb shown after the wordmark (e.g. "Dashboard", "Tech tower"). */
  contextLabel?: string;
  /** Optional dot color for the context breadcrumb (category hex). */
  contextDot?: string;
}

const PILL =
  "inline-flex items-center justify-center rounded-full px-4 min-h-[38px] text-sm font-semibold tracking-tight transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none";
const GHOST =
  "inline-flex items-center justify-center px-3 min-h-[38px] font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors";

export function Navbar({ contextLabel, contextDot }: NavbarProps) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-30 h-14 bg-void/80 backdrop-blur-md border-b border-border-subtle px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          aria-label="Tower — home"
          className="group flex items-center gap-2.5 flex-shrink-0"
        >
          {/* Altimeter tick motif */}
          <span
            className="h-6 w-[3px] rounded-full bg-signal group-hover:h-7 transition-[height]"
            aria-hidden="true"
          />
          <span className="font-display text-xl leading-none tracking-tight text-text-primary">
            TOWER
          </span>
        </Link>
        {contextLabel && (
          <>
            <span className="font-mono text-text-disabled" aria-hidden="true">
              /
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-text-secondary truncate">
              {contextDot && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: contextDot }}
                  aria-hidden="true"
                />
              )}
              {contextLabel}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Link href="/#towers" className={`${GHOST} hidden sm:inline-flex`}>
          Browse
        </Link>
        {loading ? (
          // Stable placeholder — no flash of wrong auth state
          <div
            className="h-9 w-40 rounded-full bg-elevated animate-pulse"
            aria-hidden="true"
          />
        ) : user ? (
          <>
            <Link
              href="/dashboard"
              className={`${PILL} bg-signal text-void`}
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className={GHOST}
              aria-label="Sign out"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/signin" className={GHOST}>
              Sign in
            </Link>
            <Link href="/auth/signup" className={`${PILL} bg-signal text-void`}>
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
