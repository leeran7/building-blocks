/**
 * Faq — landing FAQ (ASCENT design).
 *
 * Native <details>/<summary> so it works without client JS and stays accessible.
 * Content drawn from paid-stack mechanics and /rules.
 */

export interface FaqProps {
  minEntryUsd?: number;
  minSpendUsd?: number;
}

interface QA {
  q: string;
  a: string;
}

function buildFaqs(minEntryUsd: number, minSpendUsd: number): QA[] {
  const entry = minEntryUsd.toFixed(0);
  const spend = minSpendUsd.toFixed(0);

  return [
    {
      q: "How does altitude work?",
      a: "You buy altitude with money — each dollar converts at the current rate in metres (shown as “$1 buys” on the tower). Altitude is permanent: it never decreases through inaction. The only thing that moves is the ground beneath you.",
    },
    {
      q: "What does “$1 buys” mean?",
      a: "$1 is the exchange-rate unit, not the minimum payment. “$1 buys 2.4m” means one dollar currently purchases 2.4 metres of altitude. That rate rises as the stack accumulates views (up to 8×) and resets to $1 = 1m every new season.",
    },
    {
      q: "What’s the minimum I can pay?",
      a: `New blocks require at least $${entry} to submit. Top-ups on an existing block start at $${spend}. You cannot pay $1 — the floors are higher than the pricing unit.`,
    },
    {
      q: "What does “buried” mean?",
      a: "As the stack serves views, the ground level rises. Any block whose altitude falls below the ground line is buried — greyed out and pushed underground. Its record page stays live forever, but it drops out of the visible leaderboard until you top up.",
    },
    {
      q: "Why does the price of #1 fall over time?",
      a: "The exchange rate doubles every 500,000 qualified views (up to an 8× cap), so each dollar buys more altitude later in a season. The cost to take #1 keeps dropping — until someone actually buys it.",
    },
    {
      q: "How much does it cost to take #1?",
      a: "On an empty stack, claim #1 from $" +
        entry +
        " at season start ($" +
        entry +
        " → " +
        entry +
        "m when $1 = 1m). When someone leads, you pay for a 2% buffer above their altitude at the live rate: cost = (their altitude × 1.02 − yours) ÷ rate, with a $" +
        spend +
        " minimum. Late in a season the rate can be 8×, so overtaking gets cheaper in dollars even as the ground rises.",
    },
    {
      q: "How do I pick a stack?",
      a: "There are 74 paid stacks — one per category (Developer Tools, Indie Games, Startups, and so on). Each has its own leaderboard, season, and view counter. Pick the audience you care about; stacks don’t share rank or ground level.",
    },
    {
      q: "Paid stacks vs the free climb?",
      a: "The free climb at /climb is skill-based with one global leaderboard — no payment. Paid stacks are money-ranked per category: you buy altitude, survive burial, and compete for visibility on the tower. You can play free without an account; paid top-ups work without signing in, but submitting a new block requires auth.",
    },
    {
      q: "Do I need an account?",
      a: "The free climb is playable without an account — sign in to save your peak height and appear on the free leaderboard. For paid stacks, you can top up any existing block without an account. Sign in to submit a new block and track rank, burial risk, and competitor cost on your dashboard.",
    },
    {
      q: "Can I get a refund?",
      a: "No. Altitude is permanent and non-refundable. Stripe checkout states this before you pay. Your record page at /b/[slug] persists even if you’re buried or the season ends.",
    },
    {
      q: "What happens at the end of a season?",
      a: "Every 90 days each stack archives to a permanent standings page, cumulative views reset to zero, and the rate resets to $1 = 1m — a fresh launch moment. Record pages at /b/[slug] persist across every season.",
    },
  ];
}

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

export function Faq({ minEntryUsd = 5, minSpendUsd = 2 }: FaqProps) {
  const faqs = buildFaqs(minEntryUsd, minSpendUsd);

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
            Paid stacks FAQ
          </h2>
          <p className="text-sm text-text-secondary mt-2">
            Money, rank, burial, and seasons — the mechanics behind the towers.
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
