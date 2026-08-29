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
   * Collapse the title and meta on phones, keeping only the section tabs. The
   * game page needs that vertical space: the canvas sizes itself from whatever
   * height is left below the header (see useCanvasSize).
   */
  compactHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-void flex flex-col">
      <Navbar contextLabel="Free climb" />

      <div className="border-b border-border-subtle">
        <div
          className={
            "max-w-2xl mx-auto w-full px-4 " +
            (compactHeader
              ? "pt-3 pb-3 [@media(min-width:640px)_and_(min-height:560px)]:pt-5 [@media(min-width:640px)_and_(min-height:560px)]:pb-4"
              : "pt-5 pb-4")
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
              assistive tech and search, it just takes no room on a phone.
              Restored only when the viewport is both wide AND tall enough — a
              phone in landscape clears `sm` on width while having the least
              height to spare, which is exactly when the game needs it most. */}
          <div
            className={
              compactHeader
                ? "sr-only [@media(min-width:640px)_and_(min-height:560px)]:not-sr-only [@media(min-width:640px)_and_(min-height:560px)]:mt-5"
                : "mt-5"
            }
          >
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
              Free stack · no payment
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-1">
              {title}
            </h1>
          </div>
          {meta && (
            <div
              className={
                compactHeader
                  ? "hidden [@media(min-width:640px)_and_(min-height:560px)]:block"
                  : undefined
              }
            >
              {meta}
            </div>
          )}
        </div>
      </div>

      <div
        className={
          "w-full px-4 flex-1 overflow-x-hidden " +
          (compactHeader
            ? "py-3 [@media(min-width:640px)_and_(min-height:560px)]:py-6"
            : "py-6")
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
