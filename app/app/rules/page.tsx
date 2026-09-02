/**
 * /rules — Engine formulas page (AC-47).
 *
 * Tower Dark Editorial: system tokens, editorial header, monospace "code well"
 * cards for formulas. All data-testids and formula text preserved exactly
 * (rules-max-growth, rules-season-days, rules-growth-formula, rules-season-reset;
 * MAX_GROWTH=8, DOUBLE_EVERY_K, 500, 90-day season).
 */

import Link from "next/link";
import { Navbar } from "../../src/components/Navbar";
import { ALTITUDE_UNIT, SEASON_START_RATE } from "../../src/lib/units";

export const metadata = {
  title: "Stack — Rules & Formulas",
  description:
    "The complete Stack engine formulas: altitude permanence, growth cap, burial mechanics, and season reset.",
};

function Well({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-raised border border-border-subtle rounded-xl p-4 font-mono text-sm space-y-1.5">
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-signal font-semibold text-xs uppercase tracking-[0.15em] mb-3">
      {children}
    </h3>
  );
}

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-void">
      <Navbar contextLabel="Rules" />

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Editorial header */}
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-signal font-medium">
            The engine
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
            Rules &amp; formulas
          </h1>
          <p className="text-text-secondary mt-2">
            Every number the stack runs on — altitude permanence, the growth cap,
            burial mechanics, and the season reset.
          </p>
        </header>

        {/* Constants */}
        <section className="mb-8">
          <SectionHeading>Constants</SectionHeading>
          <Well>
            <div className="text-text-primary">
              <span className="text-text-muted">DOUBLE_EVERY_K</span> = 500{" "}
              <span className="text-text-muted"># thousand views per rate doubling</span>
            </div>
            <div className="text-text-primary" data-testid="rules-max-growth">
              <span className="text-text-muted">MAX_GROWTH</span> = 8{" "}
              <span className="text-text-muted"># hard cap on growth multiplier</span>
            </div>
            <div className="text-text-primary">
              <span className="text-text-muted">R0</span> = 1.0{" "}
              <span className="text-text-muted">{`# ${ALTITUDE_UNIT} per dollar at season start`}</span>
            </div>
            <div className="text-text-primary">
              <span className="text-text-muted">G0</span> = 0.65{" "}
              <span className="text-text-muted">{`# ground ${ALTITUDE_UNIT} at season start (tuned for ~1.5M view burial)`}</span>
            </div>
            <div className="text-text-primary">
              <span className="text-text-muted">MIN_ENTRY_USD</span> = $5.00
            </div>
            <div className="text-text-primary">
              <span className="text-text-muted">MIN_SPEND_USD</span> = $2.00
            </div>
            <div className="text-text-primary" data-testid="rules-season-days">
              <span className="text-text-muted">SEASON_DAYS</span> = 90{" "}
              <span className="text-text-muted"># season length</span>
            </div>
            <div className="text-text-primary">
              <span className="text-text-muted">CEIL_PER_HOUR</span> = 40,000{" "}
              <span className="text-text-muted"># qualified view ceiling per hour</span>
            </div>
          </Well>
        </section>

        {/* Growth formula */}
        <section className="mb-8">
          <SectionHeading>Growth &amp; rate</SectionHeading>
          <Well>
            <div className="text-text-muted text-xs mb-1">
              V = cumulative qualified views (thousands)
            </div>
            <div className="text-text-primary">λ = ln(2) / DOUBLE_EVERY_K</div>
            <div className="text-text-primary" data-testid="rules-growth-formula">
              growth = min( exp(λ · V),{" "}
              <span className="text-signal font-bold">MAX_GROWTH</span> ){" "}
              <span className="text-text-muted">← capped at 8 (non-negotiable)</span>
            </div>
            <div className="text-text-primary">
              rate = R0 · growth <span className="text-text-muted">{`# ${ALTITUDE_UNIT} per dollar`}</span>
            </div>
            <div className="text-text-primary">
              ground = G0 · growth <span className="text-text-muted">{`# burial threshold (${ALTITUDE_UNIT})`}</span>
            </div>
          </Well>
        </section>

        {/* Payment formula */}
        <section className="mb-8">
          <SectionHeading>Altitude (payments)</SectionHeading>
          <Well>
            <div className="text-text-primary">
              height = dollars · rate{" "}
              <span className="text-text-muted">{`# altitude added (${ALTITUDE_UNIT})`}</span>
            </div>
            <div className="text-text-primary">
              altitude += height{" "}
              <span className="text-text-muted"># additive only; never decreases</span>
            </div>
          </Well>
          <p className="text-text-muted text-xs mt-2">
            Altitude is monotonically increasing. No code path can decrease it. The
            database has a CHECK constraint enforcing altitude ≥ 0.
          </p>
        </section>

        {/* Burial */}
        <section className="mb-8">
          <SectionHeading>Burial &amp; amber edge</SectionHeading>
          <Well>
            <div className="text-text-primary">buried = altitude &lt; ground</div>
            <div className="text-text-primary">clearance = altitude − ground</div>
            <div className="text-text-primary">
              amber_edge = clearance &lt; 1.6 · ground{" "}
              <span className="text-text-muted"># warning zone</span>
            </div>
          </Well>
          <p className="text-text-muted text-xs mt-2">
            Buried blocks remain in the stack and are still clickable, but they&apos;re
            greyed out. A $5 entry at season start stays above ground for approximately
            1.5 million views.
          </p>
        </section>

        {/* Pricing */}
        <section className="mb-8">
          <SectionHeading>Pricing a climb</SectionHeading>
          <Well>
            <div className="text-text-primary">
              target_alt = altitude_of_target_rank · 1.02
            </div>
            <div className="text-text-primary">delta = target_alt − my_altitude</div>
            <div className="text-text-primary">
              cost = max(delta / rate, MIN_SPEND_USD)
            </div>
          </Well>
          <p className="text-text-muted text-xs mt-2">
            The 2% buffer means you beat the target block by a small margin. Positions
            are live; your rank is calculated when payment completes.
          </p>
        </section>

        {/* Season reset — AC-47 requires this */}
        <section className="mb-8" data-testid="rules-season-reset">
          <SectionHeading>Season reset (90 days)</SectionHeading>
          <p className="text-text-secondary text-sm mb-2">
            Each season runs for{" "}
            <strong className="text-text-primary">90 days</strong>. At rollover:
          </p>
          <ul className="text-text-secondary text-sm space-y-1.5 list-disc list-inside ml-1">
            <li>The current stack is archived to a permanent standings page</li>
            <li>V resets to 0 (rate drops back to R0 = {SEASON_START_RATE})</li>
            <li>New blocks start at altitude 0</li>
            <li>Record pages at /b/[slug] remain permanent and show all seasons</li>
            <li>The exchange rate caps, holds, then resets — creating a recurring launch moment</li>
          </ul>
        </section>

        {/* View counting rules */}
        <section className="mb-8">
          <SectionHeading>Qualified view definition</SectionHeading>
          <p className="text-text-secondary text-sm mb-2">
            A qualified view is one server-rendered homepage load that passes:
          </p>
          <ul className="text-text-secondary text-sm space-y-1.5 list-disc list-inside ml-1">
            <li>Not a known bot or headless browser</li>
            <li>Session not counted in the last 30 minutes (per cookie)</li>
            <li>IP not exceeding 20 views per hour</li>
            <li>Global ceiling not exceeded (max 40,000 credits per hour)</li>
          </ul>
          <p className="text-text-secondary text-sm mt-2">
            View counting is server-side only. No client beacons.
          </p>
        </section>

        <div className="border-t border-border-subtle pt-6">
          <Link
            href="/"
            className="text-text-muted hover:text-text-primary text-sm transition-colors"
          >
            ← Back to Stack
          </Link>
        </div>
      </div>
    </main>
  );
}
