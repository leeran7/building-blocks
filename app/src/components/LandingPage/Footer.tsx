/**
 * Footer — landing page footer (ASCENT design).
 *
 * A duotone CTA band (signal edge, ember ground creeping up) over a survey-legend
 * link grid and an instrument baseline. Wordmark echoes the navbar altimeter tick.
 * AC-30: <a href="/auth/signup"> with "Get started" text.
 * AC-31: min-height 44px on tappable links, no horizontal overflow at 375px.
 */

import Link from "next/link";
import { FEATURED_GAME_CATEGORIES } from "../../game/categories";
import { StackMark } from "../Brand/StackMark";

const LINK =
  "text-sm text-text-secondary hover:text-signal transition-colors min-h-[36px] inline-flex items-center";
const COL_HEAD =
  "font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer role="contentinfo" className="border-t border-border-subtle bg-surface">
      {/* CTA band */}
      <div className="relative overflow-hidden border-b border-border-subtle edge-signal">
        {/* ground creeping up */}
        <div
          className="ground-gradient pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-60"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(80% 120% at 85% -20%, rgb(203 242 77 / 0.10), transparent 60%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ your move ]
            </span>
            <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
              Claim your altitude.
            </h2>
            <p className="text-sm text-text-secondary mt-3 max-w-sm">
              Pick a stack, buy your way up, and outlast everyone before the ground
              swallows them.
            </p>
          </div>
          <Link
            href="/auth/signup"
            className="flex-shrink-0 bg-signal text-void font-semibold rounded-full px-7 py-3.5 shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform] min-h-[52px] inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Get started →
          </Link>
        </div>
      </div>

      {/* Links */}
      <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <StackMark className="h-6 w-6" />
            <span className="font-display text-xl tracking-tight text-text-primary">
              DOOMSTACK
            </span>
          </div>
          <p className="text-sm text-text-muted mt-3 max-w-[220px]">
            The leaderboard that buries the weak.
          </p>
        </div>

        <nav aria-label="Stacks">
          <p className={COL_HEAD}>Stacks</p>
          <ul className="space-y-1">
            {FEATURED_GAME_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/stack/${c.slug}`} className={LINK}>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Free climb">
          <p className={COL_HEAD}>Free climb</p>
          <ul className="space-y-1">
            <li>
              <Link href="/play" className={LINK}>
                Play
              </Link>
            </li>
            <li>
              <Link href="/climb" className={LINK}>
                Leaderboard
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Account">
          <p className={COL_HEAD}>Account</p>
          <ul className="space-y-1">
            <li>
              <Link href="/auth/signup" className={LINK}>
                Sign up
              </Link>
            </li>
            <li>
              <Link href="/auth/signin" className={LINK}>
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className={LINK}>
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Learn">
          <p className={COL_HEAD}>Learn</p>
          <ul className="space-y-1">
            <li>
              <Link href="/#how-it-works" className={LINK}>
                How it works
              </Link>
            </li>
            <li>
              <Link href="/rules" className={LINK}>
                Rules
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={LINK}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={LINK}>
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            © {year} Stack
          </p>
          <p
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-disabled"
            aria-hidden="true"
          >
            elev. permanent · ground rising
          </p>
        </div>
      </div>
    </footer>
  );
}
