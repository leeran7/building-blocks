/**
 * FreeStackShell — shared frame for the standalone free climb stack (/climb, /play).
 * Separate from CategoryShell, which wraps the 74 paid category stacks.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "./Navbar";

export function FreeStackShell({
  section,
  title,
  meta,
  compactHeader = false,
  children,
}: {
  section: "leaderboard" | "play";
  title: string;
  meta?: ReactNode;
  /**
   * Collapse the title and meta on every viewport, keeping only the section
   * tabs. The game page needs that vertical space: the canvas sizes itself from
   * whatever height is left below the header (see useCanvasSize), and restoring
   * the copy on a "tall enough" laptop made the play area smaller than on a phone.
   */
  compactHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        compactHeader
          ? "h-dvh bg-void flex flex-col overflow-hidden"
          : "min-h-screen bg-void flex flex-col"
      }
    >
      <Navbar contextLabel="Free climb" />

      <div className="border-b border-border-subtle shrink-0">
        <div
          className={
            "max-w-2xl mx-auto w-full px-4 " +
            (compactHeader ? "py-2" : "pt-5 pb-4")
          }
        >
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

          {/* sr-only rather than hidden: the heading stays in the document for
              assistive tech and search, it just takes no room. Compact mode is
              the play page — restoring the title once the viewport cleared
              560px tall stole the height budget the canvas sizes itself from,
              so a laptop rendered a smaller game than a phone. */}
          <div className={compactHeader ? "sr-only" : "mt-5"}>
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
              Free stack · no payment
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-1">
              {title}
            </h1>
          </div>
          {meta && (
            <div className={compactHeader ? "hidden" : undefined}>{meta}</div>
          )}
        </div>
      </div>

      <div
        className={
          compactHeader
            ? "w-full flex-1 min-h-0 overflow-hidden px-2 pt-2 pb-0"
            : "w-full px-4 flex-1 overflow-x-hidden py-6"
        }
      >
        {children}
      </div>
    </div>
  );
}

function FreeTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={
        "px-4 py-1.5 rounded-full text-sm font-semibold transition " +
        (active
          ? "bg-signal text-void"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}
