/**
 * AuthShell — shared split-panel layout for all four auth pages.
 *
 * Desktop: branded left panel (wordmark, pitch, mini-tower deco) + form column.
 * Mobile: form column only (panel hidden). The form column is the <main>
 * landmark; individual pages provide their own <section> card as children.
 *
 * Purely presentational — no auth logic lives here.
 */

import type { ReactNode } from "react";
import Link from "next/link";

const DECO_BARS = [94, 72, 58, 40];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-void md:grid md:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden md:flex flex-col justify-between p-10 lg:p-14 border-r border-border-subtle overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(90% 70% at 15% 5%, rgba(0,212,255,0.14), rgba(176,124,214,0.06) 45%, transparent 70%)",
          }}
        />
        <Link
          href="/"
          className="relative z-10 text-lg font-bold tracking-tight text-text-primary w-fit"
        >
          Tower
        </Link>

        <div className="relative z-10 max-w-sm">
          <h2 className="font-display text-4xl text-text-primary">
            Buy altitude.
            <br />
            <span className="text-accent-tech">Outlast everyone.</span>
          </h2>
          <p className="text-sm text-text-secondary mt-3">
            Your height is permanent — but the ground keeps rising. Claim your
            block before someone buries it.
          </p>

          {/* Mini-tower deco */}
          <div className="mt-8 space-y-2" aria-hidden="true">
            {DECO_BARS.map((w, i) => (
              <div
                key={i}
                className={`relative h-9 rounded-lg border bg-surface overflow-hidden flex items-center px-3 ${
                  i === 0 ? "border-accent-tech/40" : "border-border-subtle"
                }`}
              >
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${w}%`,
                    background:
                      "linear-gradient(90deg, rgba(0,212,255,0.16), transparent)",
                  }}
                />
                <span
                  className={`relative z-10 font-mono text-xs font-bold ${
                    i === 0 ? "text-accent-tech" : "text-text-secondary"
                  }`}
                >
                  #{i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-text-muted">
          © {new Date().getFullYear()} Tower
        </p>
      </aside>

      {/* Form column */}
      <main className="flex items-center justify-center px-4 py-10 min-h-[100dvh] md:min-h-0">
        {children}
      </main>
    </div>
  );
}
