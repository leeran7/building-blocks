/**
 * A whole page for a state rather than content: not found, coming soon, sign
 * in first, failed to load. Every such page keeps the site header, names
 * itself in an h1, says what happened, and offers a way forward, so no state
 * is a dead end (plan "Doomstack to 8/10", flow pillar).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { Navbar } from "../Navbar";

/** A link onward, or (from a client component) a button such as Try again. */
export type StatusAction = { label: string; href: string } | { label: string; onClick: () => void };

const BUTTON =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full px-6 min-h-[44px] text-sm font-semibold tracking-tight transition-[filter,transform,scale] active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void";

export function StatusPage({
  contextLabel,
  eyebrow,
  title,
  children,
  primary,
  secondary,
}: {
  contextLabel?: string;
  eyebrow?: string;
  title: string;
  /** What happened and what to do, in a sentence or two. */
  children: ReactNode;
  primary?: StatusAction;
  secondary?: StatusAction;
}) {
  return (
    <div className="grain topo relative flex min-h-screen flex-col bg-void">
      <div className="shrink-0">
        <Navbar contextLabel={contextLabel} />
      </div>
      <main id="main-content" className="flex flex-1 flex-col items-center px-4 pb-16 pt-20 text-center">
        {eyebrow && <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-text-primary md:text-4xl">{title}</h1>
        <div className="mt-3 max-w-md text-text-secondary">{children}</div>
        {(primary || secondary) && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {primary && <Action action={primary} className={`${BUTTON} bg-signal text-void hover:brightness-110`} />}
            {secondary && (
              <Action action={secondary} className={`${BUTTON} border border-border-strong text-text-primary hover:border-signal/50`} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Action({ action, className }: { action: StatusAction; className: string }) {
  if ("href" in action) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}
