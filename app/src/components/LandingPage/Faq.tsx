/**
 * Faq — landing FAQ (ASCENT design).
 *
 * Native <details>/<summary> so it works without client JS and stays accessible.
 */

import { Chevron } from "../Chevron";

interface QA {
  q: string;
  a: string;
}

/** Exported so the home page can generate matching FAQPage JSON-LD. */
export function buildFaqs(): QA[] {
  return [
    {
      q: "How do 1v1 duels work?",
      a: "You and your opponent race the same seeded tower while the lava rises from below. The first climber the lava catches loses — if both are caught on the same tick, the higher peak wins. Duels are real-time and skill-only: the outcome is decided by your climb, not chance.",
    },
    {
      q: "Do I need an account to play?",
      a: "No — you can open a challenge link and play as a guest. Sign in to save your win-loss record and track your best peak height on the free leaderboard.",
    },
    {
      q: "How do I challenge a friend?",
      a: "Go to /duel and create a private challenge link. Anyone who opens it gets matched against you on the exact same tower with the same rising lava — no account needed to accept.",
    },
    {
      q: "What's the free climb?",
      a: "The free climb at /play is a solo endless tower with one global leaderboard. No opponent, no lava catch-up mechanic — just you and the tower. Best peak height is your rank. Free, no account required to play.",
    },
    {
      q: "What are chips?",
      a: "Chips are non-cashable virtual currency you can buy and stake in ranked 1v1 duels. Winner takes the loser's stake — zero-sum, no house cut. Chips can never be cashed out or transferred.",
    },
    {
      q: "How do I get chips?",
      a: "Open your wallet and pick a package. Larger packages give bonus chips: $5 gets 500, $10 gets 1,100 (+10%), $20 gets 2,400 (+20%), and $50 gets 6,500 (+30%). You can also win chips from other players in ranked duels.",
    },
    {
      q: "Can I watch a replay?",
      a: "Yes — after a duel finishes you can watch a full replay of both players' runs side by side. Replays are also accessible from your dashboard.",
    },
  ];
}

export interface FaqProps {
  minEntryUsd?: number;
  minSpendUsd?: number;
}

export function Faq(_props: FaqProps = {}) {
  const faqs = buildFaqs();

  return (
    <section
      aria-label="Frequently asked questions"
      className="scroll-reveal py-20 px-4 border-t border-border-subtle"
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
            [ questions ]
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
            FAQ
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Everything you need to know to start climbing.
          </p>
        </div>

        <div className="space-y-2.5">
          {faqs.map((item, i) => (
            <details
              key={item.q}
              className="group bg-surface border border-border-subtle rounded-xl px-5 py-4 transition-colors hover:border-border-strong open:border-signal/40 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex items-center gap-4 cursor-pointer list-none min-h-[44px]">
                <span className="font-mono text-xs tabular-nums text-text-muted group-open:text-signal transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-base md:text-lg font-semibold text-text-primary">
                  {item.q}
                </span>
                <Chevron />
              </summary>
              <p className="text-text-secondary text-sm md:text-base leading-relaxed mt-3 pl-9">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
