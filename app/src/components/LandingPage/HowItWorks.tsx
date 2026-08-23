/**
 * HowItWorks — 3-step explanation section.
 *
 * Design spec: design.md §6.5
 * Server component — static content.
 * AC-27: DOM must contain a "how it works" section with exactly 3 step elements.
 */

import type React from "react";

function ArrowUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
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
      width="48"
      height="48"
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
      width="48"
      height="48"
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
}

const steps: Step[] = [
  {
    number: "01",
    icon: <ArrowUpIcon />,
    title: "Buy altitude",
    description: "Pay once to place your block high in the tower. Your position is permanent — it never decreases due to inaction.",
  },
  {
    number: "02",
    icon: <EyeIcon />,
    title: "Views raise the ground",
    description: "As more people view the tower, the ground level rises. Blocks that don't top up eventually get buried below the ground line.",
  },
  {
    number: "03",
    icon: <TrophyIcon />,
    title: "Outlast the competition",
    description: "Blocks that fall below ground get buried and lose visibility. Top up to stay above ground and outlast every competitor.",
  },
];

export function HowItWorks() {
  return (
    <section
      aria-label="How Tower works"
      className="py-16 px-4"
    >
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold text-text-primary mb-12 text-center">
          How it works
        </h2>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <li
              key={step.number}
              className="bg-surface rounded-xl p-6 border border-border-subtle hover:border-accent-tech/40 transition-colors"
            >
              <div className="text-accent-tech mb-4">{step.icon}</div>
              <div className="font-mono text-sm text-text-muted mb-2">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
