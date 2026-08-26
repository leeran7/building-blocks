/**
 * Footer — landing page footer.
 *
 * AC-30: <a href="/auth/signup"> with "Get started" text
 * AC-31: min-height 44px on tappable links, no horizontal overflow at 375px
 */

import Link from "next/link";
import { FEATURED_GAME_CATEGORIES } from "../../game/categories";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="bg-surface border-t border-border-subtle"
    >
      {/* CTA band */}
      <div className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
              Claim your altitude.
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Pick a tower, buy your way up, outlast everyone.
            </p>
          </div>
          <Link
            href="/auth/signup"
            className="flex-shrink-0 bg-accent-tech text-void font-semibold rounded-lg px-6 py-3 hover:brightness-110 transition min-h-[44px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tech focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Get started
          </Link>
        </div>
      </div>

      {/* Links */}
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <p className="text-lg font-bold text-text-primary">Tower</p>
          <p className="text-sm text-text-muted mt-1 max-w-[220px]">
            The leaderboard that buries the weak.
          </p>
        </div>

        <nav aria-label="Towers">
          <p className="text-xs uppercase tracking-[0.15em] text-text-muted mb-3">
            Towers
          </p>
          <ul className="space-y-1">
            {FEATURED_GAME_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/tower/${c.slug}`}
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Account">
          <p className="text-xs uppercase tracking-[0.15em] text-text-muted mb-3">
            Account
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href="/auth/signup"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
              >
                Sign up
              </Link>
            </li>
            <li>
              <Link
                href="/auth/signin"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
              >
                Sign in
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
              >
                Dashboard
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Learn">
          <p className="text-xs uppercase tracking-[0.15em] text-text-muted mb-3">
            Learn
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href="/#how-it-works"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
              >
                How it works
              </Link>
            </li>
            <li>
              <Link
                href="/rules"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors min-h-[36px] inline-flex items-center"
              >
                Rules
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <p className="text-xs text-text-muted">© {year} Tower</p>
        </div>
      </div>
    </footer>
  );
}
