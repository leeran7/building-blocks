/**
 * HowItWorks — paid-stack explanation, ASCENT design.
 *
 * Three stations on the climb (AC-27: exactly 3 step elements in the ol).
 * Below that, a paid-stack primer with rate floors and season mechanics.
 */

import type React from "react";
import Link from "next/link";

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

export interface HowItWorksProps {
  /** Minimum first payment for a new block (USD). */
  minEntryUsd?: number;
  /** Minimum top-up payment (USD). */
  minSpendUsd?: number;
}

const steps: Step[] = [
  {
    number: "01",
    icon: <ArrowUpIcon />,
    title: "Buy altitude",
    description:
      "Pick one of 74 category stacks and pay to place your block. At season start the rate is $1 = 1m — each dollar buys the live rate shown on the tower header. Your altitude is permanent; it never drops through inaction.",
    tone: "signal",
  },
  {
    number: "02",
    icon: <EyeIcon />,
    title: "The ground rises",
    description:
      "Every qualified view on that stack's pages credits views, doubles the exchange rate (up to 8×), and lifts the ground line. Blocks below ground are buried — greyed out on the leaderboard until you top up. Record pages stay live forever.",
    tone: "ember",
  },
  {
    number: "03",
    icon: <TrophyIcon />,
    title: "Outlast everyone",
    description:
      "Rank is altitude, highest first. To beat someone you pay for a 2% buffer above their height at the current rate. Stay above ground to keep visibility, top up when burial risk spikes, and outlast every competitor in your stack.",
    tone: "signal",
  },
];

export function HowItWorks({
  minEntryUsd = 5,
  minSpendUsd = 2,
}: HowItWorksProps) {
  const entryLabel = minEntryUsd.toFixed(0);
  const spendLabel = minSpendUsd.toFixed(0);

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
              How paid stacks work
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-xl">
              Real money, real rank. One leaderboard per category — separate from
              the free skill climb.
            </p>
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

        <div
          className="mt-8 rounded-2xl border border-border-subtle bg-surface p-6 md:p-8"
          aria-label="Paid stack quick reference"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
                Paid stack primer
              </h3>
              <p className="text-sm text-text-secondary mt-2 max-w-lg leading-relaxed">
                <strong className="text-text-primary">$1</strong> is the pricing
                unit — &ldquo;$1 buys&rdquo; on every tower is metres per dollar
                right now, not a payment you can make. Minimum spend is higher.
              </p>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-shrink-0">
              <PrimerStat
                label="New block"
                value={`$${entryLabel} min`}
                hint="claim #1 on empty stack"
              />
              <PrimerStat
                label="Top-up"
                value={`$${spendLabel} min`}
                hint="any existing block"
              />
              <PrimerStat label="Rate cap" value="8×" hint="doubles every 500k views" />
              <PrimerStat label="Season" value="90 days" hint="resets to $1 = 1m" />
            </dl>
          </div>
          <p className="text-xs text-text-muted mt-6 border-t border-border-subtle pt-4">
            Full formulas — growth cap, burial threshold, overtaking math — on{" "}
            <Link href="/rules" className="text-signal hover:underline">
              Rules &amp; formulas
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function PrimerStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </dt>
      <dd className="font-mono text-xl font-bold text-text-primary tabular-nums mt-0.5">
        {value}
      </dd>
      <dd className="text-[11px] text-text-muted mt-0.5">{hint}</dd>
    </div>
  );
}
