/**
 * Category Tower page — /tower/[category]
 *
 * AC-1: Shows only category blocks, uses category accent color
 * AC-2: Per-category season state
 * AC-3: Invalid category → 404
 * AC-4: CategoryTabBar active state = current category
 *
 * The whole page is wrapped in categoryTheme(cat), which sets --accent-rgb so
 * TowerHeader / BlockRow / GroundRow (and any `text-accent` etc.) resolve to
 * this tower's color. TowerView's logic is unchanged.
 *
 * Layout is a fixed-height app shell (h-[100dvh], overflow-hidden) so only the
 * tower list scrolls — fixes the previous nested `h-screen` double-scroll bug.
 */

import { notFound } from "next/navigation";
import { CategoryTabBar } from "../../../src/components/CategoryTabBar";
import { TowerView, type TowerData } from "../../../src/components/Tower/TowerView";
import { Navbar } from "../../../src/components/Navbar";
import { CATEGORY_BY_SLUG, categoryTheme } from "../../../src/lib/categories";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface TowerPageProps {
  params: { category: string };
}

export async function generateMetadata({ params }: TowerPageProps) {
  const cat = CATEGORY_BY_SLUG[params.category.toLowerCase()];
  if (!cat) {
    return { title: "Not Found — Tower" };
  }
  return {
    title: `${cat.label} Tower — Tower`,
    description: `The ${cat.label} leaderboard. Buy altitude, survive the rise, outlast everyone.`,
  };
}

async function getCategoryData(slug: string): Promise<TowerData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/tower/${slug}`, {
      next: { revalidate: 3 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const EMPTY_TOWER_DATA: TowerData = {
  season: {
    id: "none",
    views_k: 0,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: false,
  },
  engine: { growth: 1, rate: 1.0, ground: 0.5 },
  blocks: [],
  cost_of_rank1_usd: 5.0,
};

export default async function CategoryTowerPage({ params }: TowerPageProps) {
  const slug = params.category.toLowerCase();
  const cat = CATEGORY_BY_SLUG[slug];

  // AC-3: Invalid category → 404
  if (!cat) {
    notFound();
  }

  const data = await getCategoryData(slug);
  const towerData = data ?? EMPTY_TOWER_DATA;

  const ground = towerData.engine.ground;
  const rate = towerData.engine.rate;
  const activeBlockCount = towerData.blocks.filter((b) => !b.buried).length;
  const topBlock = towerData.blocks.find((b) => !b.buried) ?? towerData.blocks[0];

  const seasonEnds = new Date(towerData.season.ends_at).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );

  return (
    <div
      className="h-[100dvh] bg-void flex flex-col overflow-hidden"
      style={categoryTheme(cat)}
    >
      {/* Top nav — auth-aware */}
      <div className="flex-shrink-0">
        <Navbar contextLabel={`${cat.label} tower`} contextDot={cat.hex} />
      </div>

      {/* Category tab bar — AC-4 */}
      <div className="flex-shrink-0">
        <CategoryTabBar activeCategory={slug} />
      </div>

      {/* Mobile stats strip */}
      <div className="md:hidden bg-surface border-b border-border-subtle px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Ground</span>
            <span className="font-mono text-danger tabular-nums">{ground.toFixed(1)}m</span>
          </div>
          <div className="border-l border-border-subtle h-4" />
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">$1 buys</span>
            <span className="font-mono text-text-primary tabular-nums">{rate.toFixed(2)}m</span>
          </div>
          <div className="border-l border-border-subtle h-4" />
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Live</span>
            <span className="font-mono text-text-primary tabular-nums">{activeBlockCount}</span>
          </div>
        </div>
      </div>

      {/* Desktop: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — desktop only */}
        <aside
          className="hidden md:flex flex-col w-64 bg-surface border-r border-border-subtle px-6 py-8 flex-shrink-0 overflow-y-auto"
          aria-label={`${cat.label} tower sidebar`}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.hex }}
              aria-hidden="true"
            />
            <h1 className="text-xl font-bold text-text-primary">{cat.label}</h1>
          </div>
          <p className="text-sm text-text-muted mb-8">{cat.blurb}</p>

          {topBlock && (
            <div className="mb-8 rounded-xl border border-border-subtle bg-surface-raised p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-[0.15em] mb-1">
                Leader
              </p>
              <p className="text-sm font-semibold text-text-primary truncate">
                {topBlock.display_name}
              </p>
              <p className="font-mono text-accent text-lg font-bold tabular-nums mt-0.5">
                {topBlock.altitude.toFixed(1)}m
              </p>
            </div>
          )}

          <dl className="space-y-5 text-sm">
            {[
              { label: "Ground level", value: `${ground.toFixed(2)}m`, danger: true },
              { label: "$1 buys", value: `${rate.toFixed(2)}m` },
              { label: "Active blocks", value: String(activeBlockCount) },
              { label: "Season ends", value: seasonEnds },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[10px] text-text-muted uppercase tracking-[0.15em] mb-1">
                  {row.label}
                </dt>
                <dd
                  className={`font-mono tabular-nums ${row.danger ? "text-danger" : "text-text-primary"}`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <a
            href={`/submit?category=${slug}`}
            className="mt-8 w-full bg-accent text-void font-semibold rounded-lg py-2.5 px-4 text-sm hover:brightness-110 transition text-center min-h-[44px] inline-flex items-center justify-center"
          >
            Submit a block
          </a>
        </aside>

        {/* Main tower area — tabpanel */}
        <main
          id="tower-panel"
          role="tabpanel"
          className="flex-1 min-h-0 flex flex-col"
          aria-label={`${cat.label} tower leaderboard`}
        >
          <div
            aria-live="polite"
            className="sr-only"
            aria-atomic="true"
            id="rank-update-announcement"
          />
          <TowerView initialData={towerData} pollUrl={`/api/tower/${slug}`} />
        </main>
      </div>
    </div>
  );
}
