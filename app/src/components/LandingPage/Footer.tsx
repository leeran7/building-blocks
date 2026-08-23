/**
 * Footer — Landing page footer.
 *
 * Design spec: design.md §6.8
 * Server component — static content.
 *
 * AC-30: <a href="/auth/signup"> with "Get started" text
 * AC-31: min-height 44px on all links
 * WCAG: "Get started" in text-accent-tech (5.2:1 = AA pass)
 */

import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="bg-surface border-t border-border-subtle py-8 px-4"
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Logo + tagline */}
        <div>
          <p className="text-xl font-semibold text-text-primary">Tower</p>
          <p className="text-sm text-text-muted mt-1">
            The leaderboard that buries the weak.
          </p>
        </div>

        {/* Navigation links */}
        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href="/auth/signup"
                className="text-sm text-accent-tech hover:brightness-110 transition-colors min-h-[44px] inline-flex items-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
              >
                Get started
              </Link>
            </li>
            <li>
              <Link
                href="/tower/tech"
                className="text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] inline-flex items-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
              >
                Browse towers
              </Link>
            </li>
            <li>
              <Link
                href="/auth/signin"
                className="text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] inline-flex items-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="max-w-5xl mx-auto mt-6">
        <p className="text-xs text-text-muted">© {year} Tower</p>
      </div>
    </footer>
  );
}
