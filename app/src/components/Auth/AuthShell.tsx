/**
 * AuthShell — shared split-panel layout for all four auth pages.
 *
 * The site Navbar on top. Desktop: branded panel (pitch, what an account adds)
 * + form column. Mobile: form column only (panel hidden). The form column is the <main>
 * landmark; individual pages provide their own <section> card as children.
 *
 * Purely presentational — no auth logic lives here.
 */

import type { ReactNode } from "react";
import { Navbar } from "../Navbar";

const ACCOUNT_PERKS = ["Save every climb and your best heights", "Rank on the leaderboards", "Challenge your friends"];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain flex min-h-dvh flex-col bg-void">
      {/* The site header, so every auth page has a way home and to the game. */}
      <Navbar />
      <div className="flex-1 md:grid md:grid-cols-[1.1fr_1fr]">
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
          <div className="relative z-10 max-w-sm">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ enlist ]
            </span>
            <h2 className="font-display text-5xl text-text-primary mt-3 leading-[0.95]">
              Climb higher.
              <br />
              Outlast{" "}
              <span className="text-signal">everyone.</span>
            </h2>
            <p className="text-sm text-text-secondary mt-4">
              Race the rising lava to the summit. Free to play in your
              browser; an account keeps your progress.
            </p>

            {/* What an account adds. Was a mock leaderboard of empty #1 to #4
                bars, which read as a broken skeleton (UX audit, 2026-10-24). */}
            <ul className="mt-8 space-y-3">
              {ACCOUNT_PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-sm text-text-primary">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            © {new Date().getFullYear()} Stack
          </p>
        </aside>

        {/* Form column */}
        <main id="main-content" className="flex items-center justify-center px-4 py-10 min-h-[calc(100dvh-3.5rem)] md:min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
