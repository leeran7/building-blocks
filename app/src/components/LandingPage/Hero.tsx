/**
 * Hero — Burial Horizon (ASCENT design).
 *
 * Brand-first DOOMSTACK at display scale + one headline + one support + one CTA
 * group + one full-bleed elevation plane. No cards, no dual Paid/Free strips,
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
  width: number;
  buried?: boolean;
}

/** Illustrative stack — never live data. Safe when the paid arena is empty. */
const DEMO_BLOCKS: DemoBlock[] = [
  { name: "linear.app", altitude: "418.2", width: 96 },
  { name: "figma.com", altitude: "331.0", width: 78 },
  { name: "stripe.com", altitude: "270.4", width: 64 },
  { name: "raycast.com", altitude: "205.1", width: 49 },
  { name: "old-startup.io", altitude: "121.7", width: 30, buried: true },
  { name: "abandoned.dev", altitude: "77.3", width: 18, buried: true },
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
    <div className="relative w-full overflow-hidden rounded-none border-y border-border-subtle">
      <div className="absolute inset-0 survey-grid opacity-50" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(10 10 12 / 0.35), transparent 40%, rgb(10 10 12 / 0.55))",
        }}
      />

      <div className="relative flex items-center justify-between border-b border-border-subtle px-4 py-3 md:px-6">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          {isEmptyArena ? "Paid stack · demo" : "Paid stack · arena"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
          ▲ ground +2.4{ALTITUDE_UNIT}/day
        </span>
      </div>

      <div className="relative flex gap-3 px-4 py-5 md:gap-4 md:px-6 md:py-6">
        <div className="relative flex w-9 flex-shrink-0 flex-col justify-between py-1 text-right">
          {["500", "400", "300", "200", "100"].map((n) => (
            <span
              key={n}
              className="font-mono text-[9px] tabular-nums leading-none text-text-muted"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="altimeter w-px flex-shrink-0" />

        <div className="relative flex-1 space-y-1.5">
          {DEMO_BLOCKS.map((b, i) => {
            const leader = i === 0;
            return (
              <div key={b.name}>
                <div
                  className={`animate-climb relative flex items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2 ${
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
                    className={`relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold ${
                      b.buried
                        ? "border border-ember/40 text-ember"
                        : leader
                          ? "bg-signal text-void"
                          : "border border-border-strong text-text-secondary"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="relative z-10 flex-1 truncate text-xs font-medium text-text-primary">
                    {b.name}
                  </span>
                  <span className="relative z-10 flex-shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                    {b.altitude}
                    {ALTITUDE_UNIT}
                  </span>
                </div>

                {i === groundAfterIndex && (
                  <div className="relative my-2 flex items-center gap-2">
                    <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-ember">
                      ground 158.0{ALTITUDE_UNIT}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-ember/70 to-ember/10" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-20" />
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
      className="topo relative overflow-hidden"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(120% 70% at 15% -10%, rgb(203 242 77 / 0.14), transparent 55%), radial-gradient(90% 60% at 90% 110%, rgb(255 90 44 / 0.12), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-16 md:pt-24 md:pb-8">
        <div className="relative md:max-w-[48%]">
          <div
            className="pointer-events-none absolute -inset-x-6 -inset-y-10 hidden bg-gradient-to-r from-void via-void/85 to-transparent md:block"
            aria-hidden="true"
          />

          <div className="relative text-center md:text-left">
            <p
              className="reveal inline-flex items-center justify-center gap-2.5 md:justify-start"
              style={{ animationDelay: "0ms" }}
              data-testid="landing-hero-brand"
            >
              <StackMark className="h-8 w-8 md:h-10 md:w-10" />
              <span
                className="font-display text-[clamp(2.75rem,8vw,6rem)] leading-none tracking-tight text-text-primary"
              >
                DOOMSTACK
              </span>
            </p>

            <h1
              className="reveal font-display mt-6 text-5xl text-text-primary sm:text-6xl lg:text-7xl"
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
              className="reveal mx-auto mt-6 max-w-[36ch] text-base leading-relaxed text-text-secondary md:mx-0 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Buy altitude on a public leaderboard. Your height is{" "}
              <span className="font-medium text-text-primary">permanent</span> —
              but the ground rises with every view. {entryFloor} to claim your
              place.
            </p>

            <div
              className="reveal mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start"
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
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border border-border-strong bg-surface/60 px-7 py-3.5 text-base font-medium text-text-primary transition-colors hover:border-signal/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void sm:w-auto"
              >
                Browse stacks
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative z-0 mt-10 w-full md:-mt-28 md:pt-16"
        data-testid="landing-hero-visual"
        aria-hidden="true"
      >
        <div className="mx-auto w-full max-w-6xl px-0 md:px-4">
          <ElevationProfile isEmptyArena={isEmptyArena} />
        </div>
      </div>

      <div className="h-10 md:h-16" aria-hidden="true" />
    </section>
  );
}
