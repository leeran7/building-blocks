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
  children,
}: {
  section: "leaderboard" | "play";
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-void flex flex-col">
      <Navbar contextLabel="Free climb" />

      <div className="border-b border-border-subtle">
        <div className="max-w-2xl mx-auto w-full px-4 pt-5 pb-4">
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

          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
              Free stack · no payment
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mt-1">
              {title}
            </h1>
          </div>
          {meta}
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 py-6 flex-1">{children}</div>
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
