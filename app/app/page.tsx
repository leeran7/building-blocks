/**
 * Homepage — Tower listing + above-fold copy (AC-46).
 *
 * Five mandatory statements displayed above the fold:
 * 1. Altitude permanence
 * 2. Ground mechanics
 * 3. No-views-no-erosion
 * 4. Overtaking mechanism
 * 5. No-deletion guarantee
 */

import { TowerView, type TowerData } from "../src/components/Tower/TowerView";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function getTowerData(): Promise<TowerData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/tower`, {
      next: { revalidate: 3 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const EMPTY_DATA: TowerData = {
  season: {
    id: "none",
    views_k: 0,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: false,
  },
  engine: {
    growth: 1,
    rate: 1.0,
    ground: 0.5,
  },
  blocks: [],
  cost_of_rank1_usd: 5.0,
};

export default async function HomePage() {
  const data = await getTowerData();
  const towerData = data ?? EMPTY_DATA;

  return (
    <main className="min-h-screen">
      {/* Above-fold copy — AC-46 (5 mandatory statements) */}
      <section
        className="bg-tower-base border-b border-tower-border"
        aria-label="Tower platform explanation"
        data-testid="above-fold-copy"
      >
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Statement 1: Altitude permanence */}
          <p
            className="text-tower-text text-sm mb-2"
            data-testid="copy-altitude-permanence"
          >
            <strong>Your altitude is permanent.</strong> Once you pay, your
            position only moves up — never down due to inaction.
          </p>

          {/* Statement 2: Ground mechanics */}
          <p
            className="text-tower-text text-sm mb-2"
            data-testid="copy-ground-mechanics"
          >
            <strong>The ground rises instead.</strong> As the site serves more
            views, the ground level rises — blocks that don&apos;t top up
            eventually get buried below the ground line.
          </p>

          {/* Statement 3: No-views-no-erosion */}
          <p
            className="text-tower-text text-sm mb-2"
            data-testid="copy-no-views-no-erosion"
          >
            <strong>No views, no erosion.</strong> The ground only rises when
            real views are served. Without traffic, the tower freezes in place.
          </p>

          {/* Statement 4: Overtaking mechanism */}
          <p
            className="text-tower-text text-sm mb-2"
            data-testid="copy-overtaking"
          >
            <strong>The price of #1 falls with every thousand views</strong> —
            until someone buys it. More traffic means cheaper altitude for
            everyone, until the season fills up.
          </p>

          {/* Statement 5: No-deletion guarantee */}
          <p
            className="text-tower-text text-sm mb-4"
            data-testid="copy-no-deletion"
          >
            <strong>Your listing is never deleted.</strong> Every block has a
            permanent record page at /b/[slug], even after burial or season
            rollover.
          </p>

          <div className="flex gap-3 flex-wrap">
            <a
              href="/rules"
              className="text-xs text-tower-muted hover:text-tower-sky transition-colors"
            >
              View engine formulas →
            </a>
            <span className="text-tower-border">|</span>
            <span className="text-xs text-tower-muted">
              ${towerData.cost_of_rank1_usd.toFixed(2)} buys rank #1 right now
            </span>
          </div>
        </div>
      </section>

      {/* Tower renderer */}
      <div className="h-[calc(100vh-200px)]">
        <TowerView initialData={towerData} />
      </div>
    </main>
  );
}
