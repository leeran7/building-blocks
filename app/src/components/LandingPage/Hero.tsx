/**
 * Hero — landing hero (ASCENT design).
 *
 * The product's core mechanic drives the whole composition: you rise, the ground
 * rises to bury you. Left = the pitch (huge duotone display headline + CTAs +
 * an instrument stat strip). Right = DuelViz: two player bars racing up the same
 * tower with a lava line, replaced ElevationProfile for duel-primary IA.
 *
 * Server component. WCAG: primary CTA is void text on signal lime (~15:1).
 * The visualization is decorative (aria-hidden); all meaning lives in the pitch.
 * prefers-reduced-motion disables the staggered reveal + rising-ground motion.
 */

import Link from "next/link";
import { ALTITUDE_UNIT, formatAltitude } from "../../lib/units";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";

// DuelViz — decorative 1v1 visualization for the hero right column.
// aria-hidden; all meaning lives in the left-column pitch text.
function DuelViz() {
  return (
    <div
      className="sheen relative w-full rounded-2xl border border-border-strong bg-surface/80 shadow-lifted overflow-hidden"
      aria-hidden="true"
    >
      {/* survey grid backdrop */}
      <div className="absolute inset-0 survey-grid opacity-60" />

      {/* header — instrument readout */}
      <div className="relative flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          Live 1v1 · same tower
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
          ▲ lava rising
        </span>
      </div>

      <div className="relative px-4 py-5 space-y-3">
        {/* Player A — leading */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              You
            </span>
            <span className="font-mono text-[11px] tabular-nums text-signal font-semibold">
              312{ALTITUDE_UNIT}
            </span>
          </div>
          <div className="relative h-7 rounded-lg overflow-hidden bg-elevated border border-signal/20">
            <div
              className="animate-climb absolute inset-y-0 left-0 rounded-lg"
              style={{
                width: "80%",
                background: "linear-gradient(90deg, rgb(203 242 77 / 0.28), rgb(203 242 77 / 0.10))",
                animationDelay: "0ms",
              }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-signal font-bold">
              #1
            </span>
          </div>
        </div>

        {/* Player B — trailing */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Opponent
            </span>
            <span className="font-mono text-[11px] tabular-nums text-text-secondary">
              278{ALTITUDE_UNIT}
            </span>
          </div>
          <div className="relative h-7 rounded-lg overflow-hidden bg-elevated border border-border-subtle">
            <div
              className="animate-climb absolute inset-y-0 left-0 rounded-lg"
              style={{
                width: "65%",
                background: "linear-gradient(90deg, rgb(168 164 178 / 0.20), rgb(168 164 178 / 0.06))",
                animationDelay: "90ms",
              }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-muted">
              #2
            </span>
          </div>
        </div>

        {/* Lava / ground line */}
        <div className="relative flex items-center gap-2 py-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ember flex-shrink-0">
            lava 210{ALTITUDE_UNIT}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-ember/70 to-ember/10" />
        </div>

        {PAID_DUELS_ENABLED_PUBLIC && (
          <div className="flex justify-center pt-1">
            <span className="bg-signal/5 border border-signal/30 rounded-lg px-2 py-1 font-mono text-[11px] text-signal uppercase tracking-[0.1em]">
              Ranked chips · winner takes all
            </span>
          </div>
        )}
      </div>

      {/* molten ground creeping up from the base */}
      <div className="ground-gradient animate-groundRise pointer-events-none absolute inset-x-0 bottom-0 h-12" />
    </div>
  );
}

export interface HeroStats {
  /** Distinct free-climb players. */
  climberCount: number;
  /** Highest free-climb peak, or null if nobody has climbed. */
  topPeak: number | null;
  /** Completed chip duels. */
  rankedDuels: number;
  /** Display name of the top chip earner. */
  topEarner: string | null;
}


export function Hero({ stats }: { stats: HeroStats }) {
  const rankedStats = [
    { label: "Duels played", value: stats.rankedDuels.toLocaleString() },
    { label: "Top earner", value: stats.topEarner ?? "—" },
  ];
  const climbStats = [
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
            {PAID_DUELS_ENABLED_PUBLIC
              ? "Live duels · free & ranked"
              : "Live duels · free to play"}
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
            <strong className="font-semibold text-text-primary">Doomstack</strong>{" "}
            is a free browser climbing game. Challenge a friend or find a random
            opponent. Race the same tower — same rising lava — and outlast them.
            {PAID_DUELS_ENABLED_PUBLIC && (
              <> Free always. Go ranked by staking chips — winner takes all.</>
            )}
          </p>

          <div
            className="reveal flex flex-col sm:flex-row items-center md:items-start gap-3 mt-8"
            style={{ animationDelay: "210ms" }}
          >
            <Link
              href="/duel"
              className="group w-full sm:w-auto bg-signal text-void font-semibold rounded-full px-7 py-3.5 text-base inline-flex items-center justify-center gap-2 shadow-signal transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none min-h-[52px]"
            >
              Start a duel
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              href="/play"
              aria-label="Play free climb"
              className="w-full sm:w-auto rounded-full border border-border-strong bg-surface/60 px-7 py-3.5 text-base font-medium text-text-primary inline-flex items-center justify-center hover:border-signal/50 hover:bg-surface transition-colors min-h-[44px] min-w-[44px]"
            >
              Free climb →
            </Link>
          </div>

          {/* instrument stat strip — ranked dominant, free secondary */}
          <div
            className="reveal mt-8 space-y-2.5 max-w-md mx-auto md:mx-0"
            style={{ animationDelay: "280ms" }}
          >
            {/* RANKED — the prominent tier */}
            {PAID_DUELS_ENABLED_PUBLIC && (
              <div>
                <div className="flex items-center gap-2 mb-1.5 justify-center md:justify-start">
                  <span className="rounded-full bg-signal text-void px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] shadow-signal">
                    Ranked
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                    chip duels · winner takes all
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-signal/30 bg-border-subtle">
                  {rankedStats.map((s) => (
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
            )}

            {/* FREE — secondary tier */}
            <div data-climb-chrome className="climb-reveal space-y-2">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <span className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-secondary">
                  Free
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  free climb
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
                {climbStats.map((s, i) => (
                  <div
                    key={s.label}
                    className="animate-climbPunch bg-surface px-3 py-2 text-center md:text-left"
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
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

        {/* Visualization — decorative DuelViz, aria-hidden */}
        <div
          className="reveal relative"
          style={{ animationDelay: "180ms" }}
        >
          <DuelViz />
        </div>
      </div>
    </section>
  );
}
