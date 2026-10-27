/**
 * Hero — landing hero (ASCENT design).
 *
 * The product's core mechanic drives the whole composition: you rise, the ground
 * rises to bury you. The pitch (huge display headline whose letters drop in and
 * stack like blocks, the free climb as the main button with duels second, the
 * free-climb stats once there are any) sits beside AscentTrack: a pinned tower
 * you climb by scrolling, with a rival on the next ladder and the lava chasing
 * (see motion/TowerScene). Desktop pins both columns; phones show the pitch,
 * then the climb full-bleed.
 *
 * Server component; the motion pieces are client islands. WCAG: primary CTA
 * (/play, the free climb) is void text on signal lime (~15:1); it keeps the
 * global accent focus ring (globals.css). The scene is decorative
 * (aria-hidden); all meaning lives in the pitch. prefers-reduced-motion
 * disables the letter drop, the pin, the lava chase and the CTA flood.
 */

import { Fragment } from "react";
import { formatAltitude } from "../../lib/units";
import { AscentTrack } from "./motion/AscentTrack";
import { LavaLink } from "./motion/LavaLink";
import { letterDelayMs } from "./motion/landingMotion";

const HEADLINE: { text: string; ember?: boolean }[][] = [
  [{ text: "CLIMB." }],
  [{ text: "OR" }, { text: "GET" }],
  [{ text: "BURIED.", ember: true }],
];

/** The headline as one string: the h1's accessible name, since its letters are split into boxes. */
export const HEADLINE_TEXT = HEADLINE.map((words) => words.map((w) => w.text).join(" ")).join(" ");

/** Headline letters drop in and stack like blocks (CSS, so it runs before hydration). */
function StackedHeadline() {
  return HEADLINE.map((words, line) => {
    let index = 0;
    return (
      <span key={line} className="block" aria-hidden="true">
        {words.map((w, wi) => (
          <Fragment key={wi}>
          {wi > 0 && " "}
          <span
            className={"inline-block whitespace-nowrap " + (w.ember ? "molten-text relative" : "")}
          >
            {[...w.text].map((ch) => {
              const i = index++;
              return (
                <span
                  key={i}
                  className={(w.ember ? "molten-letter" : "block-drop") + " inline-block"}
                  style={{ animationDelay: w.ember ? `${letterDelayMs(line, i)}ms, 0ms` : `${letterDelayMs(line, i)}ms`, ["--i" as string]: i }}
                >
                  {ch}
                </span>
              );
            })}
            {w.ember && (
              <span
                className="molten-underline absolute -bottom-1 left-0 h-1 w-full bg-linear-to-r from-ember to-ember/0"
                aria-hidden="true"
              />
            )}
          </span>
          </Fragment>
        ))}
      </span>
    );
  });
}

export interface HeroStats {
  /** Distinct free-climb players. */
  climberCount: number;
  /** Highest free-climb peak, or null if nobody has climbed. */
  topPeak: number | null;
}


export function Hero({ stats }: { stats: HeroStats }) {
  // Both or neither: one stat beside an empty cell looks broken.
  const climbStats =
    stats.climberCount > 0 && stats.topPeak != null
      ? [
          { label: "Climbers", value: stats.climberCount.toLocaleString() },
          { label: "Top climb", value: formatAltitude(Math.round(stats.topPeak), 0) },
        ]
      : [];

  return (
    <section
      aria-label="Hero"
      className="topo relative overflow-x-clip px-4 pb-6 md:pb-10"
    >
      {/* atmosphere: signal wash top-left, ember pool bottom */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(120% 40% at 15% -5%, rgb(203 242 77 / 0.12), transparent 55%), radial-gradient(90% 30% at 90% 100%, rgb(255 90 44 / 0.10), transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-6 md:gap-14">
        {/* Pitch — pinned beside the climb on desktop */}
        <div className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center py-10 text-center md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] md:min-h-0 md:py-0 md:text-left">
          <span
            className="reveal inline-flex items-center gap-2 self-center md:self-start rounded-full border border-border-strong bg-surface/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-secondary"
            style={{ animationDelay: "0ms" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            Free to play · web and mobile
          </span>

          <h1
            className="reveal font-display text-6xl sm:text-7xl lg:text-8xl text-text-primary mt-6"
            style={{ animationDelay: "0ms" }}
            aria-label={HEADLINE_TEXT}
          >
            <StackedHeadline />
          </h1>

          <p
            className="reveal text-lg text-text-secondary max-w-md mx-auto md:mx-0 mt-7 leading-relaxed"
            style={{ animationDelay: "900ms" }}
          >
            <strong className="font-semibold text-text-primary">Doomstack</strong>{" "}
            is a free climbing game. Climb an endless tower before the lava
            catches you, take on today&rsquo;s Daily, or race a friend up the
            same tower.
          </p>

          <div
            className="reveal flex flex-col sm:flex-row items-center md:items-start gap-3 mt-8"
            style={{ animationDelay: "1000ms" }}
          >
            {/* Primary: the free climb, so "No account. No download." below is
                true for the button it sits under (duels need an account). */}
            <LavaLink
              href="/play"
              magnetic
              className="cta-shine group relative overflow-hidden w-full sm:w-auto bg-signal text-void font-semibold rounded-full px-7 py-3.5 text-base inline-flex items-center justify-center gap-2 shadow-signal transition-[filter,scale] hover:brightness-110 active:scale-[0.98] min-h-[52px]"
            >
              Play now, free
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                →
              </span>
            </LavaLink>
            <LavaLink
              href="/duel"
              magnetic
              className="w-full sm:w-auto rounded-full border border-border-strong bg-surface/60 px-7 py-3.5 text-base font-medium text-text-primary inline-flex items-center justify-center hover:border-signal/50 hover:bg-surface transition-colors min-h-[44px] min-w-[44px]"
            >
              Start a duel
            </LavaLink>
          </div>

          {/* The two objections, answered in four words — mockup sub-line. */}
          <p
            className="reveal mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
            style={{ animationDelay: "1080ms" }}
          >
            No account. No download.
          </p>

          {/* Free climb stats, only once there are some: a row of zeros and
              dashes reads as an empty game. */}
          {climbStats.length > 0 && (
            <div
              data-climb-chrome
              className="reveal climb-reveal mt-8 w-full max-w-md mx-auto md:mx-0"
              style={{ animationDelay: "1150ms" }}
            >
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle">
                {climbStats.map((s, i) => (
                  <div
                    key={s.label}
                    className="animate-climbPunch bg-surface px-3 py-2 text-center md:text-left"
                    style={{ animationDelay: `${1150 + i * 90}ms` }}
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {s.label}
                    </dt>
                    <dd className="font-mono text-base font-bold tabular-nums text-text-primary mt-0.5">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Phones: the climb is the next screen down. */}
          <span
            className="reveal scroll-cue inline-block self-center mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-signal md:hidden"
            style={{ animationDelay: "1300ms" }}
            aria-hidden="true"
          >
            Scroll to climb ↓
          </span>

          {/* The "already climbing? sign in" line lives under the mode cards
              (ChooseYourClimb) — one sign-in ask per screen, at the end of the
              choose-a-mode moment rather than in the middle of the pitch. */}
        </div>

        {/* The climb — decorative, aria-hidden inside */}
        <AscentTrack />
      </div>
    </section>
  );
}
