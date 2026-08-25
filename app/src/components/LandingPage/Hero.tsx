/**
 * Hero — landing page hero.
 *
 * Redesigned to *show the product*: a two-column layout with the pitch on the
 * left and a static mini-tower visualization on the right (pure CSS — no new
 * deps, no canvas) that demonstrates altitude, the six category colors, and the
 * rising ground line burying the weak.
 *
 * Server component, static content.
 * WCAG: CTA is text-void on bg-accent-tech (5.2:1). Body text is text-primary
 * (>= 15:1) / text-secondary (>= 7:1) on void. prefers-reduced-motion respected.
 */

import Link from "next/link";

interface DemoBlock {
  name: string;
  altitude: string;
  width: number; // % of track
  buried?: boolean;
}

// Illustrative — not live data. Ordered top (leader) to bottom (buried).
// One accent (the brand cyan) carries hierarchy; danger marks the buried zone.
const DEMO_BLOCKS: DemoBlock[] = [
  { name: "linear.app", altitude: "418.2", width: 96 },
  { name: "figma.com", altitude: "331.0", width: 78 },
  { name: "stripe.com", altitude: "270.4", width: 64 },
  { name: "raycast.com", altitude: "205.1", width: 49 },
  { name: "old-startup.io", altitude: "121.7", width: 30, buried: true },
  { name: "abandoned.dev", altitude: "77.3", width: 18, buried: true },
];

function MiniTower() {
  const groundAfterIndex = 3; // ground line sits below the 4th block
  return (
    <div
      className="relative w-full rounded-xl border border-border-subtle bg-surface p-4"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-tech" />
          Tech tower
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          cost of #1 · $24.80
        </span>
      </div>

      <div className="space-y-1.5">
        {DEMO_BLOCKS.map((b, i) => {
          const leader = i === 0;
          return (
            <div key={b.name}>
              <div
                className={`relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 overflow-hidden ${
                  b.buried
                    ? "border-danger/20 opacity-50"
                    : leader
                      ? "border-accent-tech/40"
                      : "border-border-subtle"
                }`}
              >
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${b.width}%`,
                    background: b.buried
                      ? "linear-gradient(90deg, rgba(255,84,112,0.10), transparent)"
                      : "linear-gradient(90deg, rgba(0,212,255,0.16), transparent)",
                  }}
                />
                <span
                  className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center font-mono text-[11px] font-bold ${
                    b.buried
                      ? "border border-danger/40 text-danger"
                      : leader
                        ? "bg-accent-tech text-void"
                        : "border border-border-strong text-text-secondary"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="relative z-10 flex-1 text-xs font-medium text-text-primary truncate">
                  {b.name}
                </span>
                <span className="relative z-10 font-mono text-[11px] text-text-muted flex-shrink-0">
                  {b.altitude}m
                </span>
              </div>

              {i === groundAfterIndex && (
                <div className="flex items-center gap-2 my-2 px-1">
                  <div className="flex-1 h-px bg-danger/50" />
                  <span className="font-mono text-[10px] text-danger flex-shrink-0">
                    ▲ ground 158.0m
                  </span>
                  <div className="flex-1 h-px bg-danger/50" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section
      aria-label="Hero"
      className="relative overflow-hidden px-4 pt-16 pb-12 md:pt-24 md:pb-20"
    >
      {/* Subtle background wash — decorative */}
      <div
        className="hero-bg-animated absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 85% 55% at 25% 0%, rgba(0,212,255,0.14), rgba(176,124,214,0.07) 45%, transparent 72%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
        {/* Pitch */}
        <div className="text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-text-secondary mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-tech" />
            Six towers · one survivor each
          </span>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl text-text-primary text-balance">
            The leaderboard that{" "}
            <span className="text-accent-tech">buries the weak</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-md mx-auto md:mx-0 mt-5">
            Buy altitude. Your height is permanent — but the ground rises with
            every view. Top up, or get buried.
          </p>

          <div className="flex flex-col sm:flex-row items-center md:items-start gap-3 mt-8">
            <Link
              href="/auth/signup"
              className="hero-glow w-full sm:w-auto bg-accent-tech text-void font-semibold rounded-lg px-7 py-3.5 text-base inline-flex items-center justify-center gap-2 hover:brightness-110 focus-visible:outline-none min-h-[48px]"
            >
              Enter the arena →
            </Link>
            <Link
              href="/tower/tech"
              className="w-full sm:w-auto rounded-lg border border-border-strong bg-surface px-7 py-3.5 text-base font-medium text-text-primary inline-flex items-center justify-center hover:bg-elevated transition-colors min-h-[48px]"
            >
              Browse towers
            </Link>
          </div>

          <p className="text-sm text-text-muted mt-4">
            Already climbing?{" "}
            <Link
              href="/auth/signin"
              className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Visualization */}
        <div className="relative">
          <MiniTower />
        </div>
      </div>
    </section>
  );
}
