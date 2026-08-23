/**
 * Category Tower page — /tower/[category]
 *
 * Design spec: design.md §6.14, §7.2
 * AC-1: Shows only category blocks, uses category accent color
 * AC-2: Per-category season state
 * AC-3: Invalid category → 404
 * AC-4: CategoryTabBar active state = current category
 *
 * Server component — data fetched at render.
 * TowerView is READ-ONLY — not modified. Passed category-filtered data.
 */

import { notFound } from "next/navigation";
import { CategoryTabBar } from "../../../src/components/CategoryTabBar";
import { TowerView, type TowerData } from "../../../src/components/Tower/TowerView";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface CategoryConfig {
  slug: string;
  label: string;
  accent: string;
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  tech: { slug: "tech", label: "Tech", accent: "#00d4ff" },
  design: { slug: "design", label: "Design", accent: "#ff6b9d" },
  business: { slug: "business", label: "Business", accent: "#ffd700" },
  creative: { slug: "creative", label: "Creative", accent: "#9b59b6" },
  gaming: { slug: "gaming", label: "Gaming", accent: "#00ff88" },
  science: { slug: "science", label: "Science", accent: "#ff8c00" },
};

interface TowerPageProps {
  params: { category: string };
}

export async function generateMetadata({ params }: TowerPageProps) {
  const cat = CATEGORY_MAP[params.category.toLowerCase()];
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
  engine: {
    growth: 1,
    rate: 1.0,
    ground: 0.5,
  },
  blocks: [],
  cost_of_rank1_usd: 5.0,
};

export default async function CategoryTowerPage({ params }: TowerPageProps) {
  const slug = params.category.toLowerCase();
  const cat = CATEGORY_MAP[slug];

  // AC-3: Invalid category → 404
  if (!cat) {
    notFound();
  }

  const data = await getCategoryData(slug);
  const towerData = data ?? EMPTY_TOWER_DATA;

  const ground = towerData.engine.ground;
  const rate = towerData.engine.rate;
  const views_k = towerData.season.views_k;
  const activeBlockCount = towerData.blocks.filter((b) => !b.buried).length;

  // Season end date formatting
  const seasonEnds = new Date(towerData.season.ends_at).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-4 py-3 bg-void/80 backdrop-blur border-b border-border-subtle">
        <a
          href="/"
          className="text-xl font-semibold text-text-primary hover:text-accent-tech transition-colors"
        >
          Tower
        </a>
        <div className="flex items-center gap-3">
          <a
            href="/auth/signin"
            className="text-sm text-text-muted hover:text-text-primary transition-colors min-h-[44px] inline-flex items-center"
          >
            Sign in
          </a>
          <a
            href="/auth/signup"
            className="text-sm font-medium bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary hover:bg-elevated transition-colors min-h-[44px] inline-flex items-center"
          >
            Submit block
          </a>
        </div>
      </nav>

      {/* Category tab bar — AC-4 */}
      <CategoryTabBar activeCategory={slug} />

      {/* Mobile stats strip */}
      <div className="md:hidden bg-surface border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Ground</span>
            <span className="font-mono text-text-primary">{ground.toFixed(1)}m</span>
          </div>
          <div className="border-l border-border-subtle h-4" />
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Rate</span>
            <span className="font-mono text-text-primary">{rate.toFixed(2)}m/k</span>
          </div>
          <div className="border-l border-border-subtle h-4" />
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted text-xs">Blocks</span>
            <span className="font-mono text-text-primary">{activeBlockCount}</span>
          </div>
        </div>
      </div>

      {/* Desktop: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — desktop only */}
        <aside
          className="hidden md:flex flex-col w-60 bg-surface border-r border-border-subtle px-6 py-8 flex-shrink-0"
          aria-label={`${cat.label} tower sidebar`}
        >
          {/* Category heading with accent dot */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.accent }}
              aria-hidden="true"
            />
            <h1 className="text-xl font-semibold text-text-primary">
              {cat.label} Tower
            </h1>
          </div>

          {/* Stats */}
          <dl className="space-y-5 text-sm">
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider mb-0.5">
                Ground level
              </dt>
              <dd className="font-mono text-text-primary">
                {ground.toFixed(2)}m
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider mb-0.5">
                Inflation rate
              </dt>
              <dd className="font-mono text-text-primary">
                {rate.toFixed(2)}m / 1k views
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider mb-0.5">
                Active blocks
              </dt>
              <dd className="font-mono text-text-primary">{activeBlockCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider mb-0.5">
                Season ends
              </dt>
              <dd className="font-mono text-text-primary">{seasonEnds}</dd>
            </div>
          </dl>

          {/* Submit CTA */}
          <a
            href="/auth/signup"
            className="mt-8 w-full bg-surface border border-border-subtle rounded-lg py-2.5 px-4 text-sm text-text-primary hover:bg-elevated transition-colors text-center min-h-[44px] inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
          {/* ARIA live region for rank updates (design.md §8.3) */}
          <div
            aria-live="polite"
            className="sr-only"
            aria-atomic="true"
            id="rank-update-announcement"
          />

          {/* TowerView — polls category-specific endpoint (AC-1) */}
          <TowerView initialData={towerData} pollUrl={`/api/tower/${slug}`} />
        </main>
      </div>
    </div>
  );
}
