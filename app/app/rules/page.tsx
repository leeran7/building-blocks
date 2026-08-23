/**
 * /rules — Engine formulas page (AC-47).
 *
 * Displays all formulas including MAX_GROWTH=8, DOUBLE_EVERY_K, season reset.
 */

export const metadata = {
  title: "Tower — Rules & Formulas",
  description:
    "The complete Tower engine formulas: altitude permanence, growth cap, burial mechanics, and season reset.",
};

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-tower-base">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <a
            href="/"
            className="text-tower-muted hover:text-tower-sky text-sm"
          >
            ← Tower
          </a>
        </div>

        <h1 className="text-3xl font-black text-tower-sky uppercase tracking-widest mb-2">
          TOWER
        </h1>
        <h2 className="text-xl text-tower-text font-bold mb-8">
          Rules &amp; Engine Formulas
        </h2>

        {/* Constants */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Constants
          </h3>
          <div className="bg-tower-surface border border-tower-border rounded p-4 font-mono text-sm space-y-1">
            <div className="text-tower-text">
              <span className="text-tower-muted">DOUBLE_EVERY_K</span> = 500{" "}
              <span className="text-tower-muted">
                # thousand views per rate doubling
              </span>
            </div>
            <div className="text-tower-text" data-testid="rules-max-growth">
              <span className="text-tower-muted">MAX_GROWTH</span> = 8{" "}
              <span className="text-tower-muted">
                # hard cap on growth multiplier
              </span>
            </div>
            <div className="text-tower-text">
              <span className="text-tower-muted">R0</span> = 1.0{" "}
              <span className="text-tower-muted">
                # metres per dollar at season start
              </span>
            </div>
            <div className="text-tower-text">
              <span className="text-tower-muted">G0</span> = 0.65{" "}
              <span className="text-tower-muted">
                # ground metres at season start (tuned for ~1.5M view burial)
              </span>
            </div>
            <div className="text-tower-text">
              <span className="text-tower-muted">MIN_ENTRY_USD</span> = $5.00
            </div>
            <div className="text-tower-text">
              <span className="text-tower-muted">MIN_SPEND_USD</span> = $2.00
            </div>
            <div className="text-tower-text" data-testid="rules-season-days">
              <span className="text-tower-muted">SEASON_DAYS</span> = 90{" "}
              <span className="text-tower-muted"># season length</span>
            </div>
            <div className="text-tower-text">
              <span className="text-tower-muted">CEIL_PER_HOUR</span> = 40,000{" "}
              <span className="text-tower-muted">
                # qualified view ceiling per hour
              </span>
            </div>
          </div>
        </section>

        {/* Growth formula */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Growth &amp; Rate
          </h3>
          <div className="bg-tower-surface border border-tower-border rounded p-4 font-mono text-sm space-y-2">
            <div className="text-tower-muted text-xs mb-2">
              V = cumulative qualified views (thousands)
            </div>
            <div className="text-tower-text">
              λ = ln(2) / DOUBLE_EVERY_K
            </div>
            <div
              className="text-tower-text"
              data-testid="rules-growth-formula"
            >
              growth = min( exp(λ · V),{" "}
              <span className="text-tower-sky font-bold">MAX_GROWTH</span> ){" "}
              <span className="text-tower-muted">
                ← capped at 8 (non-negotiable)
              </span>
            </div>
            <div className="text-tower-text">
              rate = R0 · growth{" "}
              <span className="text-tower-muted"># metres per dollar</span>
            </div>
            <div className="text-tower-text">
              ground = G0 · growth{" "}
              <span className="text-tower-muted"># burial threshold (m)</span>
            </div>
          </div>
        </section>

        {/* Payment formula */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Altitude (payments)
          </h3>
          <div className="bg-tower-surface border border-tower-border rounded p-4 font-mono text-sm space-y-2">
            <div className="text-tower-text">
              metres = dollars · rate{" "}
              <span className="text-tower-muted">
                # altitude added per dollar
              </span>
            </div>
            <div className="text-tower-text">
              altitude += metres{" "}
              <span className="text-tower-muted">
                # additive only; never decreases
              </span>
            </div>
          </div>
          <p className="text-tower-muted text-xs mt-2">
            Altitude is monotonically increasing. No code path can decrease it.
            The database has a CHECK constraint enforcing altitude ≥ 0.
          </p>
        </section>

        {/* Burial */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Burial &amp; Amber Edge
          </h3>
          <div className="bg-tower-surface border border-tower-border rounded p-4 font-mono text-sm space-y-2">
            <div className="text-tower-text">
              buried = altitude &lt; ground
            </div>
            <div className="text-tower-text">
              clearance = altitude − ground
            </div>
            <div className="text-tower-text">
              amber_edge = clearance &lt; 1.6 · ground{" "}
              <span className="text-tower-muted"># warning zone</span>
            </div>
          </div>
          <p className="text-tower-muted text-xs mt-2">
            Buried blocks remain in the tower and are still clickable, but
            they&apos;re greyed out. A $5 entry at season start stays above
            ground for approximately 1.5 million views.
          </p>
        </section>

        {/* Pricing */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Pricing a climb
          </h3>
          <div className="bg-tower-surface border border-tower-border rounded p-4 font-mono text-sm space-y-2">
            <div className="text-tower-text">
              target_alt = altitude_of_target_rank · 1.02
            </div>
            <div className="text-tower-text">delta = target_alt − my_altitude</div>
            <div className="text-tower-text">
              cost = max(delta / rate, MIN_SPEND_USD)
            </div>
          </div>
          <p className="text-tower-muted text-xs mt-2">
            The 2% buffer means you beat the target block by a small margin.
            Positions are live; your rank is calculated when payment completes.
          </p>
        </section>

        {/* Season reset — AC-47 requires this */}
        <section className="mb-8" data-testid="rules-season-reset">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Season reset (90 days)
          </h3>
          <p className="text-tower-muted text-sm mb-2">
            Each season runs for <strong className="text-tower-text">90 days</strong>.
            At rollover:
          </p>
          <ul className="text-tower-muted text-sm space-y-1 list-disc list-inside ml-2">
            <li>The current tower is archived to a permanent standings page</li>
            <li>V resets to 0 (rate drops back to R0 = $1 = 1m)</li>
            <li>New blocks start at altitude 0</li>
            <li>Record pages at /b/[slug] remain permanent and show all seasons</li>
            <li>
              The exchange rate caps, holds, then resets — creating a recurring
              launch moment
            </li>
          </ul>
        </section>

        {/* View counting rules */}
        <section className="mb-8">
          <h3 className="text-tower-sky font-bold text-sm uppercase tracking-wider mb-3">
            Qualified view definition
          </h3>
          <p className="text-tower-muted text-sm mb-2">
            A qualified view is one server-rendered homepage load that passes:
          </p>
          <ul className="text-tower-muted text-sm space-y-1 list-disc list-inside ml-2">
            <li>Not a known bot or headless browser</li>
            <li>Session not counted in the last 30 minutes (per cookie)</li>
            <li>IP not exceeding 20 views per hour</li>
            <li>
              Global ceiling not exceeded (max 40,000 credits per hour)
            </li>
          </ul>
          <p className="text-tower-muted text-sm mt-2">
            View counting is server-side only. No client beacons.
          </p>
        </section>

        <div className="border-t border-tower-border pt-6">
          <a href="/" className="text-tower-muted hover:text-tower-sky text-sm">
            ← Back to Tower
          </a>
        </div>
      </div>
    </main>
  );
}
