/**
 * FreeStackShell — shared frame for the standalone free climb stack (/climb, /play).
 * Separate from CategoryShell, which wraps the 74 paid category stacks.
 *
 * Navbar + a tab-only header band are identical on both routes. Title, CTA and
 * meta live in the panel below the hairline so switching Leaderboard/Play does
 * not jump the tabs. The play panel scrolls (canvas + controls card); it is not
 * a fill-viewport overflow-hidden stage.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "./Navbar";

export function FreeStackShell({
  section,
  title,
  children,
}: {
  section: FreeStackSection;
  title: string;
  children: ReactNode;
}) {
  const play = section === "play";

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <div className="shrink-0">
        <Navbar contextLabel="Free climb" />
      </div>

      <div className="border-b border-border-subtle shrink-0">
        <div className="max-w-2xl mx-auto w-full px-4 py-2">
          <div
            className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
            role="tablist"
            aria-label="Free stack sections"
          >
            <FreeTab
              href="/climb"
              label="Leaderboard"
              active={section === "leaderboard"}
            />
            <FreeTab href="/play" label="Play" active={section === "play"} />
          </div>
        </div>
      </div>

      {play ? (
        <div className="w-full flex-1 px-2 pt-2 pb-[max(0px,env(safe-area-inset-bottom))]">
          <h1 className="sr-only">{title}</h1>
          {children}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto w-full px-4 py-6">{children}</div>
      )}
    </div>
  );
}

/**
 * Route links, not a WAI-ARIA tabs widget. Do not bind ArrowLeft/ArrowRight —
 * those keys move the climber on /play. Enter/Space follow the native Link.
 */
function FreeTab({
  href,
  label,
  active,
}: {
  href: "/climb" | "/play";
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-semibold whitespace-nowrap transition-[color,filter] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
        (active
          ? "bg-signal text-void hover:brightness-110"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}

export type FreeStackSection = "leaderboard" | "play";
