/**
 * DuelPromo — landing-page 1v1 duel section (ASCENT design).
 *
 * Placed between the free leaderboard and the FAQ: solo competitive → head-to-head
 * → mechanics. Drives awareness with a single canonical CTA to /duel (matchmaking,
 * challenge links, and W-L record all live on that page — this is just the teaser).
 *
 * Copy reflects the real rule: both players race the SAME seeded tower while the
 * lava death-line rises; the first climber caught loses. No timer, not "highest
 * peak wins".
 */

import type React from "react";
import Link from "next/link";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";

function LinkIcon() {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SwordsIcon() {
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
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="m5 14 4 4" />
      <path d="m7 17-4 4" />
      <path d="m3 19 2 2" />
    </svg>
  );
}

function CoinsIcon() {
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
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </svg>
  );
}

interface Mode {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const modes: Mode[] = [
  {
    icon: <LinkIcon />,
    title: "Challenge a friend",
    description:
      "Create a private link and share it. Whoever opens it races you on the exact same tower — same layout, same rising lava.",
  },
  {
    icon: <SwordsIcon />,
    title: "Find an opponent",
    description:
      "Jump in the queue and get matched with a random climber for a live head-to-head. Rematch on a fresh tower with one tap.",
  },
];

export function DuelPromo() {
  return (
    <section
      id="duel"
      aria-label="1v1 duel"
      className="scroll-mt-20 py-20 px-4 border-t border-border-subtle bg-surface/30"
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              {PAID_DUELS_ENABLED_PUBLIC ? "[ multiplayer · real stakes ]" : "[ multiplayer ]"}
            </span>
            <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
              1v1 head-to-head
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-xl">
              {PAID_DUELS_ENABLED_PUBLIC
                ? "Same tower, same rising lava — the last climber standing wins. Play free, or stake credits and take the pot. Pure skill: outcomes are decided by your climb, not chance."
                : "Same tower, same rising lava — the last climber standing wins. Free and skill-only, separate from paid stacks."}
            </p>
          </div>
          <span
            className="hidden md:block font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted"
            aria-hidden="true"
          >
            live duel
          </span>
        </div>

        {PAID_DUELS_ENABLED_PUBLIC && (
          <div className="reveal mb-4 rounded-2xl border border-signal/40 bg-signal/5 p-6 shadow-signal">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-xl border border-signal/40 bg-signal/10 text-signal flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6">
                <CoinsIcon />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">
                  Paid 1v1 — winner takes the pot
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed mt-2">
                  Buy credits, stake a friend head-to-head, and the winner takes the pot
                  (minus a 10% fee) as cashable winnings. Skill-based, 18+, not available
                  in all states.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modes.map((mode, i) => (
            <div
              key={mode.title}
              className="reveal group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-6 transition-colors hover:border-signal/45"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="w-12 h-12 rounded-xl border border-signal/30 bg-signal/10 text-signal flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6">
                {mode.icon}
              </div>
              <h3 className="text-lg font-bold text-text-primary mt-5">
                {mode.title}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed mt-2">
                {mode.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <Link
            href="/duel"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-signal text-void font-semibold px-7 py-3.5 shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform] min-h-[52px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Start a duel
            <span aria-hidden="true">→</span>
          </Link>
          <p className="text-xs text-text-secondary max-w-xs">
            Play a challenge link as a guest — sign in to keep your win-loss record.
          </p>
        </div>
      </div>
    </section>
  );
}
