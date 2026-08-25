"use client";

/**
 * Navbar — shared, auth-aware top navigation.
 *
 * Reflects login state (the previous per-page navs always showed "Sign in /
 * Get started"): signed-in users get Dashboard + Sign out; signed-out users get
 * Sign in + Get started. Renders a stable skeleton while auth resolves to avoid
 * a flash of the wrong state. Playful styling — pill CTAs, single cyan accent.
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
  "inline-flex items-center justify-center rounded-full px-4 min-h-[40px] text-sm font-semibold transition";
const GHOST =
  "inline-flex items-center justify-center px-3 min-h-[40px] text-sm font-medium text-text-muted hover:text-text-primary transition-colors";

export function Navbar({ contextLabel, contextDot }: NavbarProps) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-30 h-14 bg-void/85 backdrop-blur border-b border-border-subtle px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-text-primary hover:text-accent-tech transition-colors flex-shrink-0"
        >
          Tower
        </Link>
        {contextLabel && (
          <>
            <span className="text-border-strong" aria-hidden="true">
              /
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary truncate">
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

      <div className="flex items-center gap-1.5 sm:gap-2">
        {loading ? (
          // Stable placeholder — no flash of wrong auth state
          <div className="h-9 w-40 rounded-full bg-elevated animate-pulse" aria-hidden="true" />
        ) : user ? (
          <>
            <Link
              href="/tower/tech"
              className={`${GHOST} hidden sm:inline-flex`}
            >
              Browse
            </Link>
            <Link
              href="/dashboard"
              className={`${PILL} bg-accent-tech text-void hover:brightness-110`}
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
            <Link
              href="/auth/signup"
              className={`${PILL} bg-accent-tech text-void hover:brightness-110`}
            >
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
