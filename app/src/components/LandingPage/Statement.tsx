/**
 * Statement — the landing's one-line manifesto between the modes and the
 * board: the game's rule in one line, lit word by word as you scroll
 * (motion/ScrollWords). Server component; the lighting is a client island.
 */

import { ScrollWords, type StatementWord } from "./motion/ScrollWords";

export const STATEMENT: StatementWord[] = [
  { text: "Every" },
  { text: "floor" },
  { text: "you" },
  { text: "climb," },
  { text: "the", hot: true },
  { text: "lava", hot: true },
  { text: "climbs", hot: true },
  { text: "too.", hot: true },
  { text: "Stop," },
  { text: "and" },
  { text: "it" },
  { text: "catches" },
  { text: "you." },
];

export function Statement() {
  return (
    <section aria-label="How it works, in one line" className="relative px-4 py-24 md:py-36">
      <div className="max-w-5xl mx-auto">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">[ the rule ]</span>
        <ScrollWords
          words={STATEMENT}
          className="mt-6 font-display text-4xl leading-[1.08] sm:text-6xl lg:text-7xl"
        />
      </div>
    </section>
  );
}
