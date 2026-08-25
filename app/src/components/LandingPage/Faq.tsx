/**
 * Faq — landing FAQ (Tailwind UI "FAQ" disclosure pattern, Playful accordion).
 *
 * Native <details>/<summary> so it works without client JS and stays accessible.
 * Playful: paper-white cards, generous radius, italic question, stone chevron.
 * Content is real (drawn from the /rules mechanics), not filler.
 */

interface QA {
  q: string;
  a: string;
}

const FAQS: QA[] = [
  {
    q: "How does altitude work?",
    a: "You buy altitude with money — $1 converts to the current rate in metres. Altitude is permanent: it never decreases through inaction. The only thing that moves is the ground beneath you.",
  },
  {
    q: "What does “buried” mean?",
    a: "As the tower serves views, the ground level rises. Any block whose altitude falls below the ground line is buried — greyed out and pushed underground. Its record page stays live forever, but it drops out of the visible leaderboard until you top up.",
  },
  {
    q: "Why does the price of #1 fall over time?",
    a: "The exchange rate doubles every 500,000 views (up to an 8× cap), so each dollar buys more altitude later in a season. The cost to take #1 keeps dropping — until someone actually buys it.",
  },
  {
    q: "Do I need an account to play?",
    a: "You can top up any existing block without an account. You only need to sign in to submit a new block and track its rank, burial risk, and competitor cost on your dashboard.",
  },
  {
    q: "What happens at the end of a season?",
    a: "Every 90 days the tower archives to a permanent standings page, cumulative views reset to zero, and the rate resets to $1 = 1m — a fresh launch moment. Record pages at /b/[slug] persist across every season.",
  },
];

function Chevron() {
  return (
    <svg
      className="w-5 h-5 text-text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Faq() {
  return (
    <section aria-label="Frequently asked questions" className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <span className="text-xs uppercase tracking-[0.2em] text-accent-tech font-medium">
            Questions
          </span>
          <h2 className="font-display text-3xl md:text-4xl text-text-primary mt-2">
            Frequently asked
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group bg-surface border border-border-subtle rounded-2xl shadow-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none min-h-[44px]">
                <span className="text-base md:text-lg font-semibold italic text-text-primary">
                  {item.q}
                </span>
                <Chevron />
              </summary>
              <p className="text-text-secondary text-sm md:text-base leading-relaxed mt-3">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
