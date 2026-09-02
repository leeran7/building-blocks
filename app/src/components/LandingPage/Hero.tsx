/**
 * Hero — landing hero (ASCENT design).
 *
 * The product's core mechanic drives the whole composition: you rise, the ground
 * rises to bury you. Left = the pitch (huge duotone display headline + CTAs +
 * an instrument stat strip). Right = an altimeter "elevation profile": a ranked
 * stack of blocks with a glowing signal leader at the summit and a molten ember
 * ground creeping up to bury the bottom two. Pure CSS — no canvas, no new deps.
 *
 * Server component. WCAG: primary CTA is void text on signal lime (~15:1).
 * The visualization is decorative (aria-hidden); all meaning lives in the pitch.
 * prefers-reduced-motion disables the staggered reveal + rising-ground motion.
 */

import Link from "next/link";
import { ALTITUDE_UNIT, formatAltitude } from "../../lib/units";

interface DemoBlock {
  name: string;
  altitude: string;
  width: number; // % of track
  buried?: boolean;
}

// Illustrative — not live data. Ordered top (leader) to bottom (buried).
const DEMO_BLOCKS: DemoBlock[] = [
  { name: "linear.app", altitude: "418.2", width: 96 },
  { name: "figma.com", altitude: "331.0", width: 78 },
  { name: "stripe.com", altitude: "270.4", width: 64 },
  { name: "raycast.com", altitude: "205.1", width: 49 },
  { name: "old-startup.io", altitude: "121.7", width: 30, buried: true },
  { name: "abandoned.dev", altitude: "77.3", width: 18, buried: true },
];

export interface HeroStats {
  /** Live paid blocks across all stacks. */
  totalBlocks: number;
  /** Minimum entry price (USD) — the honest "claim #1" floor. */
  minEntryUsd: number;
  /** Distinct free-climb players. */
  climberCount: number;
  /** Highest free-climb peak, or null if nobody has climbed. */
  topPeak: number | null;
}

function ElevationProfile() {
  const groundAfterIndex = 3; // ember ground sits below the 4th block
  return (
    <div
      className="relative w-full rounded-2xl border border-border-strong bg-surface/80 shadow-lifted overflow-hidden"
      aria-hidden="true"
    >
      {/* survey grid backdrop */}
      <div className="absolute inset-0 survey-grid opacity-60" />

      {/* header — instrument readout */}
      <div className="relative flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-signal" />
          Paid stack · live
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
          ▲ ground +2.4{ALTITUDE_UNIT}/day
        </span>
      </div>

      <div className="relative flex gap-3 px-4 py-4">
        {/* altimeter ruler */}
        <div className="relative flex-shrink-0 w-9 flex flex-col justify-between py-1 text-right">
          {["500", "400", "300", "200", "100"].map((n) => (
            <span
              key={n}
              className="font-mono text-[9px] tabular-nums text-text-muted leading-none"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="w-px altimeter flex-shrink-0" />

        {/* ranked stack */}
        <div className="relative flex-1 space-y-1.5">
          {DEMO_BLOCKS.map((b, i) => {
            const leader = i === 0;
            return (
              <div key={b.name}>
                <div
                  className={`animate-climb relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 overflow-hidden ${
                    b.buried
                      ? "border-ember/25 opacity-55"
                      : leader
                        ? "border-signal/50 shadow-signal"
                        : "border-border-subtle"
                  }`}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${b.width}%`,
                      background: b.buried
                        ? "linear-gradient(90deg, rgb(255 90 44 / 0.16), transparent)"
                        : leader
                          ? "linear-gradient(90deg, rgb(203 242 77 / 0.22), transparent)"
                          : "linear-gradient(90deg, rgb(203 242 77 / 0.10), transparent)",
                    }}
                  />
                  <span
                    className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center font-mono text-[11px] font-bold ${
                      b.buried
                        ? "border border-ember/40 text-ember"
                        : leader
                          ? "bg-signal text-void"
                          : "border border-border-strong text-text-secondary"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="relative z-10 flex-1 text-xs font-medium text-text-primary truncate">
                    {b.name}
                  </span>
                  <span className="relative z-10 font-mono text-[11px] tabular-nums text-text-muted flex-shrink-0">
                    {b.altitude}{ALTITUDE_UNIT}
                  </span>
                </div>

                {i === groundAfterIndex && (
                  <div className="relative flex items-center gap-2 my-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ember flex-shrink-0">
                      ground 158.0{ALTITUDE_UNIT}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-ember/70 to-ember/10" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* molten ground creeping up from the base */}
      <div className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-16" />
    </div>
  );
}

export function Hero({ stats }: { stats: HeroStats }) {
  const paidStats = [
    { label: "Blocks climbing", value: stats.totalBlocks.toLocaleString() },
    { label: "Claim #1", value: `from $${stats.minEntryUsd.toFixed(0)}` },
  ];
  const freeStats = [
    { label: "Climbers", value: stats.climberCount.toLocaleString() },
    {
      label: "Top climb",
      value: stats.topPeak != null ? formatAltitude(Math.round(stats.topPeak), 0) : "—",
    },
  ];

  return (
    <section
      aria-label="Hero"
      className="topo relative overflow-hidden px-4 pt-16 pb-14 md:pt-24 md:pb-24"
    >
      {/* atmosphere: signal wash top-left, ember pool bottom */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(120% 70% at 15% -10%, rgb(203 242 77 / 0.12), transparent 55%), radial-gradient(90% 60% at 90% 110%, rgb(255 90 44 / 0.10), transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-10 md:gap-14 items-center">
        {/* Pitch */}
        <div className="text-center md:text-left">
          <span
            className="reveal inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-secondary"
            style={{ animationDelay: "0ms" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            Season 01 · 74 stacks live
          </span>

          <h1
            className="reveal font-display text-6xl sm:text-7xl lg:text-8xl text-text-primary mt-6"
            style={{ animationDelay: "70ms" }}
          >
            CLIMB.
            <br />
            OR GET
            <br />
            <span className="relative inline-block text-ember">
              BURIED.
              <span
                className="absolute -bottom-1 left-0 h-1 w-full bg-gradient-to-r from-ember to-ember/0"
                aria-hidden="true"
              />
            </span>
          </h1>

          <p
            className="reveal text-lg text-text-secondary max-w-md mx-auto md:mx-0 mt-7 leading-relaxed"
            style={{ animationDelay: "140ms" }}
          >
            Buy altitude on a public leaderboard and get your brand seen. Your
            height is{" "}
            <span className="text-text-primary font-medium">permanent</span> — but
            the ground rises with every view. Top up, or sink beneath it.
          </p>

          <div
            className="reveal flex flex-col sm:flex-row items-center md:items-start gap-3 mt-8"
            style={{ animationDelay: "210ms" }}
          >
            <Link
              href="/auth/signup"
              className="group w-full sm:w-auto bg-signal text-void font-semibold rounded-full px-7 py-3.5 text-base inline-flex items-center justify-center gap-2 shadow-signal transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none min-h-[52px]"
            >
              Enter the arena
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href="/#towers"
              className="w-full sm:w-auto rounded-full border border-border-strong bg-surface/60 px-7 py-3.5 text-base font-medium text-text-primary inline-flex items-center justify-center hover:border-signal/50 hover:bg-surface transition-colors min-h-[52px]"
            >
              Browse stacks
            </Link>
          </div>

          {/* instrument stat strip — paid dominant, free secondary */}
          <div
            className="reveal mt-8 space-y-2.5 max-w-md mx-auto md:mx-0"
            style={{ animationDelay: "280ms" }}
          >
            {/* PAID — the prominent tier */}
            <div>
              <div className="flex items-center gap-2 mb-1.5 justify-center md:justify-start">
                <span className="rounded-full bg-signal text-void px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] shadow-signal">
                  Paid
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  real stakes · 74 stacks
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-signal/30 bg-border-subtle">
                {paidStats.map((s) => (
                  <div key={s.label} className="bg-surface px-3 py-2.5 text-center md:text-left">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {s.label}
                    </dt>
                    <dd className="font-mono text-lg font-bold tabular-nums text-signal mt-0.5">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* FREE — warm-up game, muted */}
            <div>
              <div className="flex items-center gap-2 mb-1.5 justify-center md:justify-start">
                <span className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary">
                  Free
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  warm-up game
                </span>
                <Link
                  href="/play"
                  className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary hover:border-signal/50 hover:text-signal transition-colors"
                >
                  play{" "}
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
                {freeStats.map((s) => (
                  <div key={s.label} className="bg-surface px-3 py-2 text-center md:text-left">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {s.label}
                    </dt>
                    <dd className="font-mono text-base font-bold tabular-nums text-text-secondary mt-0.5">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <p
            className="reveal text-sm text-text-muted mt-5"
            style={{ animationDelay: "340ms" }}
          >
            Already climbing?{" "}
            <Link
              href="/auth/signin"
              className="text-text-secondary underline underline-offset-4 decoration-border-strong hover:text-signal hover:decoration-signal transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Visualization */}
        <div
          className="reveal relative"
          style={{ animationDelay: "180ms" }}
        >
          <ElevationProfile />
        </div>
      </div>
    </section>
  );
}
