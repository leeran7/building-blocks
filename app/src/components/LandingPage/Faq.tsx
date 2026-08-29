/**
 * Faq — landing FAQ (ASCENT design).
 *
 * Native <details>/<summary> so it works without client JS and stays accessible.
 * Styled as a survey legend: mono index per row, signal chevron, hairline cards.
 * Content is real (drawn from the /rules mechanics), not filler.
 */

interface QA {
  q: string;
  a: string;
}

const FAQS: QA[] = [
  {
    q: "How does altitude work?",
    a: "You buy altitude with money — $1 converts to the current rate in metres. Altitude is permanent: it never decreases through inaction. The only thing that moves is the ground beneath you. The same metres are where your sign hangs in the free climb.",
  },
  {
    q: "Does a paid block show up in the game?",
    a: "Yes. Above-ground blocks hang in the free climb at the altitude they bought. Climbers see your name on the way up. If the ground rises past you, the lava swallows the sign — same burial as the leaderboard.",
  },
  {
    q: "What does “buried” mean?",
    a: "As the stack serves views, the ground level rises. Any block whose altitude falls below the ground line is buried — greyed out and pushed underground. Its record page stays live forever, but it drops out of the visible leaderboard until you top up.",
  },
  {
    q: "Why does the price of #1 fall over time?",
    a: "The exchange rate doubles every 500,000 views (up to an 8× cap), so each dollar buys more altitude later in a season. The cost to take #1 keeps dropping — until someone actually buys it.",
  },
  {
    q: "Do I need an account to play?",
    a: "The free climb is playable without an account — but you need to sign in to save your peak height and appear on the free leaderboard. For paid stacks, you can top up any existing block without an account; sign in to submit a new block and track rank, burial risk, and competitor cost on your dashboard.",
  },
  {
    q: "What happens at the end of a season?",
    a: "Every 90 days the stack archives to a permanent standings page, cumulative views reset to zero, and the rate resets to $1 = 1m — a fresh launch moment. Record pages at /b/[slug] persist across every season.",
  },
];

function Chevron() {
  return (
    <svg
      className="w-5 h-5 text-text-muted transition-transform duration-200 group-open:rotate-45 group-open:text-signal flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Faq() {
  return (
    <section
      aria-label="Frequently asked questions"
      className="py-20 px-4 border-t border-border-subtle"
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
            [ questions ]
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
            Before you climb
          </h2>
        </div>

        <div className="space-y-2.5">
          {FAQS.map((item, i) => (
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
