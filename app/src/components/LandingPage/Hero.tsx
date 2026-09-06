/**
 * Hero — Burial Horizon Option A (ASCENT design).
 *
 * Full-bleed elevation plane as atmospheric underlay; brand + pitch + CTAs
 * overlay the left ~45% with a left→transparent void scrim. Mobile: type stacks
 * over a shorter edge-to-edge band (no inset card). No dual Paid/Free strips,
 * no live `0` as the primary number. Empty arena uses DEMO_BLOCKS + invitation /
 * from-$N. Motion: M1 `.reveal` stagger, M2 `animate-groundRise`, M3 one-shot
 * `animate-climb` on demo bars (CTA hover is CSS transition only).
 */

import Link from "next/link";
import { StackMark } from "../Brand/StackMark";
import { ALTITUDE_UNIT } from "../../lib/units";

interface DemoBlock {
  name: string;
  altitude: string;
  /** Relative fill of the monument slab (0–100). */
  width: number;
  /** Visual thickness of the slab — taller = more monument presence. */
  mass: number;
  buried?: boolean;
}

/** Illustrative stack — never live data. Safe when the paid arena is empty. */
const DEMO_BLOCKS: DemoBlock[] = [
  { name: "linear.app", altitude: "418.2", width: 100, mass: 56 },
  { name: "figma.com", altitude: "331.0", width: 84, mass: 48 },
  { name: "stripe.com", altitude: "270.4", width: 70, mass: 42 },
  { name: "raycast.com", altitude: "205.1", width: 54, mass: 36 },
  { name: "old-startup.io", altitude: "121.7", width: 34, mass: 28, buried: true },
  { name: "abandoned.dev", altitude: "77.3", width: 22, mass: 22, buried: true },
];

export interface HeroStats {
  /** Live paid total — empty-branch only; never rendered as a dominant "0". */
  totalBlocks: number;
  /** Pricing floor copy e.g. "from $X" — non-zero-safe. */
  minEntryUsd: number;
}

function ElevationProfile({ isEmptyArena }: { isEmptyArena: boolean }) {
  const groundAfterIndex = 3;
  return (
    <div className="relative flex h-full min-h-[inherit] w-full flex-col overflow-hidden rounded-none">
      <div className="absolute inset-0 survey-grid opacity-55" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(10 10 12 / 0.15), transparent 28%, rgb(10 10 12 / 0.45) 70%, rgb(10 10 12 / 0.72))",
        }}
      />
      {/* Ember ground mass rising into the stack */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] md:h-[62%]"
        style={{
          background:
            "radial-gradient(120% 80% at 70% 100%, rgb(255 90 44 / 0.34), transparent 58%), linear-gradient(to top, rgb(255 90 44 / 0.22), rgb(255 90 44 / 0.08) 35%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex items-center justify-between border-b border-border-subtle/80 px-4 py-3 md:px-8 md:py-4">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          {isEmptyArena ? "Paid stack · demo" : "Paid stack · arena"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
          ▲ ground +2.4{ALTITUDE_UNIT}/day
        </span>
      </div>

      <div className="relative z-10 flex flex-1 gap-3 px-3 py-4 md:gap-5 md:px-8 md:py-7">
        <div className="relative flex w-8 flex-shrink-0 flex-col justify-between py-1 text-right md:w-10">
          {["500", "400", "300", "200", "100"].map((n) => (
            <span
              key={n}
              className="font-mono text-[9px] tabular-nums leading-none text-text-muted md:text-[10px]"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="altimeter w-px flex-shrink-0 self-stretch opacity-80" />

        <div className="relative flex flex-1 flex-col justify-center gap-2 md:gap-2.5">
          {DEMO_BLOCKS.map((b, i) => {
            const leader = i === 0;
            return (
              <div key={b.name} className="flex flex-col gap-2 md:gap-2.5">
                <div
                  className={`animate-climb relative flex items-center overflow-hidden rounded-none border-y border-l-[3px] ${
                    b.buried
                      ? "border-y-ember/20 border-l-ember/55 opacity-60"
                      : leader
                        ? "border-y-signal/35 border-l-signal shadow-signal"
                        : "border-y-border-subtle border-l-signal/40"
                  }`}
                  style={{
                    animationDelay: `${i * 90}ms`,
                    height: `${b.mass}px`,
                    maxWidth: `${b.width}%`,
                  }}
                >
                  <span
                    className="absolute inset-0"
                    style={{
                      background: b.buried
                        ? "linear-gradient(90deg, rgb(255 90 44 / 0.28), rgb(255 90 44 / 0.06) 70%, transparent)"
                        : leader
                          ? "linear-gradient(90deg, rgb(203 242 77 / 0.32), rgb(203 242 77 / 0.08) 65%, transparent)"
                          : "linear-gradient(90deg, rgb(203 242 77 / 0.16), rgb(203 242 77 / 0.04) 60%, transparent)",
                    }}
                  />
                  <span
                    className={`relative z-10 ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center font-mono text-[12px] font-bold md:ml-4 md:h-8 md:w-8 md:text-[13px] ${
                      b.buried
                        ? "border border-ember/45 text-ember"
                        : leader
                          ? "bg-signal text-void"
                          : "border border-border-strong text-text-secondary"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="relative z-10 ml-3 flex-1 truncate font-display text-sm tracking-tight text-text-primary md:ml-4 md:text-base">
                    {b.name}
                  </span>
                  <span className="relative z-10 mr-3 flex-shrink-0 font-mono text-xs tabular-nums text-text-secondary md:mr-5 md:text-sm">
                    {b.altitude}
                    {ALTITUDE_UNIT}
                  </span>
                </div>

                {i === groundAfterIndex && (
                  <div className="relative my-1 flex items-center gap-3 md:my-2">
                    <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-ember md:text-[10px]">
                      ground 158.0{ALTITUDE_UNIT}
                    </span>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-ember via-ember/50 to-ember/0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-28 md:h-40" />
    </div>
  );
}

export function Hero({ stats }: { stats: HeroStats }) {
  const isEmptyArena = stats.totalBlocks === 0;
  const entryFloor = `from $${stats.minEntryUsd.toFixed(0)}`;

  return (
    <section
      aria-label="Hero"
      data-testid="landing-hero"
      className="topo relative isolate overflow-hidden"
    >
      {/* Dual radial washes — signal NW, ember SE — stronger than iter1 */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(115% 75% at 12% -8%, rgb(203 242 77 / 0.2), transparent 52%), radial-gradient(95% 70% at 88% 108%, rgb(255 90 44 / 0.18), transparent 58%)",
        }}
      />

      {/*
        Option A: full-bleed elevation plane as atmospheric underlay.
        Desktop: fills the section behind type. Mobile: shorter band under type
        still edge-to-edge (no inset card / max-w boxing).
      */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[min(52%,420px)] w-full md:inset-0 md:h-auto"
        data-testid="landing-hero-visual"
        aria-hidden="true"
      >
        <ElevationProfile isEmptyArena={isEmptyArena} />
      </div>

      {/* Type + CTAs overlay — left ~45% on desktop with void scrim */}
      <div className="relative z-10 flex min-h-[640px] items-start md:min-h-[720px] md:items-center lg:min-h-[780px]">
        <div className="relative w-full px-4 pb-[min(52%,420px)] pt-14 sm:px-6 md:w-[45%] md:pb-24 md:pl-8 md:pr-6 md:pt-20 lg:pl-12 xl:pl-16">
          {/* Left → transparent void scrim for AA contrast over the plane */}
          <div
            className="pointer-events-none absolute inset-y-0 -left-4 right-0 bg-gradient-to-r from-void via-void/90 to-transparent md:-left-8 md:right-[-35%] lg:via-void/85"
            aria-hidden="true"
          />

          <div className="relative text-center md:text-left">
            <p
              className="reveal inline-flex items-center justify-center gap-2.5 md:justify-start"
              style={{ animationDelay: "0ms" }}
              data-testid="landing-hero-brand"
            >
              <StackMark className="h-8 w-8 md:h-11 md:w-11" />
              <span className="font-display text-[clamp(2.75rem,8vw,6rem)] leading-none tracking-tight text-text-primary">
                DOOMSTACK
              </span>
            </p>

            <h1
              className="reveal font-display mt-5 text-4xl leading-[0.95] text-text-primary sm:text-5xl md:mt-7 lg:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              CLIMB.
              <br />
              OR GET
              <br />
              <span className="relative inline-block text-ember">
                BURIED.
                <span
                  className="absolute -bottom-1 left-0 h-px w-full bg-gradient-to-r from-ember to-ember/0"
                  aria-hidden="true"
                />
              </span>
            </h1>

            <p
              className="reveal mx-auto mt-5 max-w-[34ch] text-base leading-relaxed text-text-secondary md:mx-0 md:mt-6 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Buy altitude on a public leaderboard. Your height is{" "}
              <span className="font-medium text-text-primary">permanent</span> —
              but the ground rises with every view. {entryFloor} to claim your
              place.
            </p>

            <div
              className="reveal mt-7 flex flex-col items-center gap-3 sm:flex-row md:mt-8 md:items-start"
              style={{ animationDelay: "240ms" }}
              data-testid="landing-hero-cta"
            >
              <Link
                href="/auth/signup"
                className="group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-signal px-7 py-3.5 text-base font-semibold text-void shadow-signal transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void sm:w-auto"
              >
                Enter the arena
                <span className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              <Link
                href="/#towers"
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border border-border-strong bg-void/50 px-7 py-3.5 text-base font-medium text-text-primary transition-colors hover:border-signal/50 hover:bg-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void sm:w-auto"
              >
                Browse stacks
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
