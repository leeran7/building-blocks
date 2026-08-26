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
    <div className="grain min-h-[100dvh] bg-void md:grid md:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — desktop only */}
      <aside className="topo relative hidden md:flex flex-col justify-between p-10 lg:p-14 border-r border-border-subtle overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(90% 70% at 15% 5%, rgb(203 242 77 / 0.12), transparent 55%), radial-gradient(80% 60% at 90% 110%, rgb(255 90 44 / 0.10), transparent 60%)",
          }}
        />
        <Link
          href="/"
          className="relative z-10 flex items-center gap-2.5 w-fit"
        >
          <span className="h-6 w-[3px] rounded-full bg-signal" aria-hidden="true" />
          <span className="font-display text-xl tracking-tight text-text-primary">
            TOWER
          </span>
        </Link>

        <div className="relative z-10 max-w-sm">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
            [ enlist ]
          </span>
          <h2 className="font-display text-5xl text-text-primary mt-3 leading-[0.95]">
            Buy altitude.
            <br />
            Outlast{" "}
            <span className="text-signal">everyone.</span>
          </h2>
          <p className="text-sm text-text-secondary mt-4">
            Your height is permanent — but the ground keeps rising. Claim your
            block before someone buries it.
          </p>

          {/* Mini elevation deco */}
          <div className="mt-8 space-y-2" aria-hidden="true">
            {DECO_BARS.map((w, i) => {
              const buried = i === DECO_BARS.length - 1;
              const leader = i === 0;
              return (
                <div
                  key={i}
                  className={`relative h-9 rounded-lg border bg-surface overflow-hidden flex items-center px-3 ${
                    leader
                      ? "border-signal/45"
                      : buried
                        ? "border-ember/25 opacity-60"
                        : "border-border-subtle"
                  }`}
                >
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${w}%`,
                      background: buried
                        ? "linear-gradient(90deg, rgb(255 90 44 / 0.16), transparent)"
                        : "linear-gradient(90deg, rgb(203 242 77 / 0.16), transparent)",
                    }}
                  />
                  <span
                    className={`relative z-10 font-mono text-xs font-bold tabular-nums ${
                      leader
                        ? "text-signal"
                        : buried
                          ? "text-ember"
                          : "text-text-secondary"
                    }`}
                  >
                    #{i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="relative z-10 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
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
