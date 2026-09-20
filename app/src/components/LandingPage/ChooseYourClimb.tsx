/**
 * ChooseYourClimb — the landing's mode index (ASCENT design).
 *
 * Three ways to play, side by side, directly under the hero: Solo, 1v1, Daily.
 * This is the canonical home for the Daily entry and for the "pick a mode"
 * moment; the hero above keeps exactly one filled primary (1v1) and one plain
 * secondary (free climb), so no destination is pitched twice as a filled CTA
 * (app/DESIGN.md, "Calls to action"). Each card carries its mode's distinct
 * one-liner — it does not restate the hero pitch.
 *
 * Server component. Each card is a single anchor so the whole surface is the
 * target (≥44px); the arrow and the altimeter ticks are decorative.
 */

import Link from "next/link";
import { FREE_CLIMB_HREF, DUEL_HREF, DAILY_HREF } from "../navLinks";

interface ClimbMode {
  href: string;
  /** Short display title — the mode name, not a sentence. */
  title: string;
  /** One line: what this mode is. */
  description: string;
  /** Names the action at the destination (DESIGN.md: name the action). */
  action: string;
  /** Accessible name for the whole card link. */
  label: string;
  /** Signal-toned = the free front door; the rest stay neutral. */
  tone: "signal" | "neutral";
}

const MODES: ClimbMode[] = [
  {
    href: FREE_CLIMB_HREF,
    title: "Solo",
    description: "Endless tower. Outclimb the rising lava and set your peak.",
    action: "Play now",
    label: "Play free climb",
    tone: "signal",
  },
  {
    href: DUEL_HREF,
    title: "1v1",
    description: "Challenge a friend or queue a random rival for a live head-to-head.",
    action: "Enter the arena",
    label: "Open 1v1 duels",
    tone: "neutral",
  },
  {
    href: DAILY_HREF,
    title: "Daily",
    description: "Today's tower, same seed for everyone. One climb a day.",
    action: "Face today's tower",
    label: "Open the daily climb",
    tone: "neutral",
  },
];

export function ChooseYourClimb() {
  return (
    <section
      aria-labelledby="choose-your-climb"
      className="scroll-reveal relative px-4 pb-16 pt-2 md:pb-20"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section rule — display label, then a hairline running to the edge. */}
        <div className="flex items-center gap-4">
          <h2
            id="choose-your-climb"
            className="font-display text-xl sm:text-2xl uppercase tracking-[0.12em] text-text-primary whitespace-nowrap"
          >
            Choose your climb
          </h2>
          <span
            className="h-px flex-1 bg-linear-to-r from-border-strong to-transparent"
            aria-hidden="true"
          />
        </div>

        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODES.map((mode, i) => (
            <li key={mode.title}>
              <Link
                href={mode.href}
                aria-label={mode.label}
                className={
                  "reveal group relative flex h-full min-h-[44px] flex-col overflow-hidden rounded-2xl border bg-surface p-6 transition-[transform,translate,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lifted motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void " +
                  (mode.tone === "signal"
                    ? "border-signal/30 hover:border-signal/60"
                    : "border-border-subtle hover:border-signal/45")
                }
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {/* Altimeter ticks — the tower motif, decorative. */}
                <span
                  className="altimeter pointer-events-none absolute right-5 top-6 bottom-6 w-px opacity-30 group-hover:opacity-60 transition-opacity"
                  aria-hidden="true"
                />

                <span className="font-display text-3xl uppercase tracking-tight text-text-primary">
                  {mode.title}
                </span>
                <span className="mt-2 max-w-[22ch] text-sm leading-relaxed text-text-secondary">
                  {mode.description}
                </span>
                <span
                  className={
                    "mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] " +
                    (mode.tone === "signal" ? "text-signal" : "text-text-secondary group-hover:text-signal")
                  }
                >
                  {mode.action}
                  <span
                    className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Sign-in is the nav's job (and the footer's end-of-page ask); this
            line stays only for the native-app beta — a distinct destination not
            pitched anywhere else on the landing (app/DESIGN.md: one canonical
            home per destination). */}
        <p className="mt-8 text-center text-sm text-text-muted">
          Want it on your phone?{" "}
          <Link
            href="/beta"
            className="text-text-secondary underline underline-offset-4 decoration-border-strong hover:text-signal hover:decoration-signal transition-colors"
          >
            Join the app beta
          </Link>
        </p>
      </div>
    </section>
  );
}
