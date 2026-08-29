/**
 * HowItWorks — 3-step explanation, ASCENT design.
 *
 * Reads as three stations on a climb: big mono altimeter numbers, a signal-lime
 * icon plate, and duotone language (signal = rise, ember = burial). Server
 * component, static content.
 * AC-27: DOM must contain a "how it works" section with exactly 3 step elements.
 */

import type React from "react";

function ArrowUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5m-7 7 7-7 7 7" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17a2 2 0 0 1-2 2h4a2 2 0 0 1-2-2v-2.34" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

interface Step {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "signal" | "ember";
}

const steps: Step[] = [
  {
    number: "01",
    icon: <ArrowUpIcon />,
    title: "Buy altitude",
    description:
      "Pay once to place your block on a public stack. Your height is permanent — it never drops through inaction.",
    tone: "signal",
  },
  {
    number: "02",
    icon: <EyeIcon />,
    title: "Hang on the climb",
    description:
      "Your block appears in the free climb at the metres you bought. Climbers pass your name on the way up — that's the visibility you paid for.",
    tone: "signal",
  },
  {
    number: "03",
    icon: <TrophyIcon />,
    title: "The ground rises",
    description:
      "Every view the stack serves lifts the ground line. Stop topping up and you sink beneath it — buried on the leaderboard and gone from the climb.",
    tone: "ember",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-label="How Stack works"
      className="scroll-mt-20 py-20 px-4 border-t border-border-subtle bg-surface/30"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ the rules ]
            </span>
            <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
              How the climb works
            </h2>
          </div>
          <span
            className="hidden md:block font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted"
            aria-hidden="true"
          >
            3 stations
          </span>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step) => {
            const ember = step.tone === "ember";
            return (
              <li
                key={step.number}
                className={`group relative overflow-hidden rounded-2xl border bg-surface p-6 transition-colors ${
                  ember
                    ? "border-border-subtle hover:border-ember/45"
                    : "border-border-subtle hover:border-signal/45"
                }`}
              >
                {/* faint altimeter numeral */}
                <span
                  className="pointer-events-none absolute -top-3 right-3 font-display text-7xl leading-none text-border-strong/50 select-none"
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                <div
                  className={`relative w-12 h-12 rounded-xl border flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6 ${
                    ember
                      ? "border-ember/30 bg-ember/10 text-ember"
                      : "border-signal/30 bg-signal/10 text-signal"
                  }`}
                >
                  {step.icon}
                </div>

                <div className="relative mt-5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    Station {step.number}
                  </span>
                  <h3 className="text-lg font-bold text-text-primary mt-1.5">
                    {step.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed mt-2">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
