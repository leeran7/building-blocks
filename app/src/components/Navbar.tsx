/**
 * Navbar -- shared top navigation (ASCENT design).
 *
 * Server component: the logo, wordmark, and static nav links are rendered on
 * the server. The auth-dependent section (loading skeleton / AccountMenu /
 * Sign in + Get started) is a client island in NavbarAuth.
 */

import Link from "next/link";
import { Wordmark } from "./Brand/Wordmark";
import { NavbarAuth } from "./NavbarAuth";
import { FREE_CLIMB_HREF, DUEL_HREF, DAILY_HREF, modeForContext, type GameMode } from "./navLinks";

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
  "items-center justify-center whitespace-nowrap px-3 min-h-[44px] min-w-[44px] font-mono text-xs uppercase tracking-[0.14em] transition-colors";

// Colour is chosen per link, never both: two text-* utilities on one element
// resolve by stylesheet order, not class order.
const MODE_IDLE = "text-text-muted hover:text-text-primary";
const MODE_ACTIVE = "text-signal underline decoration-2 underline-offset-8";

/** The mode links, in navbar order. */
const MODES: { mode: GameMode; href: string; label: string }[] = [
  { mode: "1v1", href: DUEL_HREF, label: "1v1" },
  { mode: "daily", href: DAILY_HREF, label: "Daily" },
  { mode: "endless", href: FREE_CLIMB_HREF, label: "Endless" },
];

export function Navbar({ contextLabel, contextDot }: NavbarProps) {
  // The page's own mode is marked (signal text + underline), so the navbar
  // says which mode you are in and the stack band under it only has to say
  // Leaderboard or Play.
  const active = modeForContext(contextLabel);
  return (
    <nav className="sticky top-0 z-30 h-14 bg-void/80 backdrop-blur-md border-b border-border-subtle px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          aria-label="Doomstack — home"
          className="group flex min-h-[44px] min-w-[44px] items-center gap-2.5 shrink-0"
        >
          <Wordmark
            decorative
            className="h-6 sm:h-8 w-auto group-hover:scale-105 transition-transform"
          />
        </Link>
        {contextLabel && (
          // Hidden on phones, where it could only show a few letters beside the
          // auth buttons; each page's own heading says where you are. From sm
          // up, min-w-0 down the chain lets it ellipsize instead of pushing the
          // wordmark into the links.
          <div className="hidden min-w-0 sm:flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-text-secondary">
            <span className="text-text-muted shrink-0" aria-hidden="true">
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
        {MODES.map(({ mode, href, label }) => (
          <Link
            key={mode}
            href={href}
            aria-current={mode === active ? "true" : undefined}
            className={`${GHOST} hidden sm:inline-flex ${mode === active ? MODE_ACTIVE : MODE_IDLE}`}
          >
            {label}
          </Link>
        ))}
        <NavbarAuth />
      </div>
    </nav>
  );
}
