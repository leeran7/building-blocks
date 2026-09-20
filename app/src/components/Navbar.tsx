/**
 * Navbar -- shared top navigation (ASCENT design).
 *
 * Server component: the logo, wordmark, and static nav links are rendered on
 * the server. The auth-dependent section (loading skeleton / AccountMenu /
 * Sign in + Get started) is a client island in NavbarAuth.
 */

import Link from "next/link";
import { StackMark } from "./Brand/StackMark";
import { NavbarAuth } from "./NavbarAuth";
import { FREE_CLIMB_HREF, DUEL_HREF, DAILY_HREF } from "./navLinks";

interface NavbarProps {
  /** Optional breadcrumb shown after the wordmark (e.g. "Dashboard", "Tech stack"). */
  contextLabel?: string;
  /** Optional dot color for the context breadcrumb (category hex). */
  contextDot?: string;
}

// No `display` utility in the base: each link sets its own (`hidden sm:inline-flex`)
// so it is genuinely hidden below `sm`. A baked-in `inline-flex` here collided
// with the appended `hidden` at the same specificity and won, leaking the links
// under the wordmark on phones.
const GHOST =
  "items-center justify-center px-3 min-h-[38px] font-mono text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors";

export function Navbar({ contextLabel, contextDot }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-30 h-14 bg-void/80 backdrop-blur-md border-b border-border-subtle px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          aria-label="Doomstack — home"
          className="group flex items-center gap-2.5 shrink-0"
        >
          {/* Doomstack logo mark */}
          <StackMark className="h-6 w-6 group-hover:scale-105 transition-transform" />
          <span className="font-display text-xl leading-none tracking-tight text-text-primary">
            DOOMSTACK
          </span>
        </Link>
        {contextLabel && (
          // min-w-0 down the chain lets the breadcrumb label truncate instead of
          // pushing the wordmark into the auth buttons at 375px. The wordmark
          // stays shrink-0; only this label ellipsizes when space runs out.
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-text-secondary">
            <span className="text-text-disabled shrink-0" aria-hidden="true">
              /
            </span>
            {contextDot && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: contextDot }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{contextLabel}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Link href={DUEL_HREF} className={`${GHOST} hidden sm:inline-flex`}>
          1v1
        </Link>
        <Link href={DAILY_HREF} className={`${GHOST} hidden sm:inline-flex`}>
          Daily
        </Link>
        <Link href={FREE_CLIMB_HREF} className={`${GHOST} hidden sm:inline-flex`}>
          Free climb
        </Link>
        <NavbarAuth />
      </div>
    </nav>
  );
}
