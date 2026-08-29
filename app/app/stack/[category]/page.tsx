/**
 * Category Tower page — /tower/[category] (the PAID tower for a subcategory).
 *
 * Only subcategories get towers: broad/legacy or unknown slugs redirect to
 * /browse. Shares the category shell with /climb and /play — Navbar →
 * CategoryNav (all 74 subcategories) → a centered header (section tabs, title,
 * stats) → the leaderboard — so switching sections has no big layout jump.
 *
 * Fixed-height app shell (h-[100dvh]) so only TowerView's virtualized list
 * scrolls; its logic is unchanged.
 */

import { redirect } from "next/navigation";
import { CategoryShell } from "../../../src/components/CategoryShell";
import { TowerView, type TowerData } from "../../../src/components/Tower/TowerView";
import { resolveBaseUrl } from "../../../src/config/public";
import { isGameCategory, resolveGameCategory } from "../../../src/game/categories";

const BASE_URL = resolveBaseUrl();

export async function generateMetadata({ params }: TowerPageProps) {
  const { category } = await params;
  const cat = resolveGameCategory(category.toLowerCase());
  return {
    title: `${cat.label} Stack — Stack`,
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
  season: null,
  engine: { growth: 1, rate: 1.0, ground: 0.5 },
  blocks: [],
  cost_of_rank1_usd: 5.0,
};

export default async function CategoryTowerPage({ params }: TowerPageProps) {
  const { category: categoryParam } = await params;
  const slug = categoryParam.toLowerCase();
  // Only subcategories get towers. Broad/legacy slugs (tech, gaming, …) or
  // unknown slugs route to the category index instead.
  if (!isGameCategory(slug)) {
    redirect("/browse");
  }
  const category = resolveGameCategory(slug);

  const data = await getCategoryData(slug);
  const towerData = data ?? EMPTY_TOWER_DATA;

  const ground = towerData.engine.ground;
  const rate = towerData.engine.rate;
  const activeBlockCount = towerData.blocks.filter((b) => !b.buried).length;

  // A stack with no season yet has no end date to show. Previously this read a
  // date fabricated 90 days out, which looked like a real deadline.
  const seasonEnds = towerData.season
    ? new Date(towerData.season.ends_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not started";

  return (
    <CategoryShell
      slug={slug}
      section="tower"
      eyebrow={`Paid stack · ${category.family}`}
      title={category.label}
      action={
        <a
          href={`/submit?category=${slug}`}
          className="inline-flex items-center justify-center rounded-lg bg-accent text-void font-semibold px-5 min-h-[40px] text-sm hover:brightness-110 transition"
        >
          Submit a block
        </a>
      }
      meta={
        <dl className="mt-4 flex items-center gap-x-5 gap-y-1 flex-wrap text-sm">
          <Stat label="Ground" value={`${ground.toFixed(1)}m`} danger />
          <Stat label="$1 buys" value={`${rate.toFixed(2)}m`} />
          <Stat label="Live" value={String(activeBlockCount)} />
          <Stat label="Season ends" value={seasonEnds} />
        </dl>
      }
      fill
    >
      <div aria-live="polite" className="sr-only" aria-atomic="true" id="rank-update-announcement" />
      <TowerView
        initialData={towerData}
        pollUrl={`/api/tower/${slug}`}
        submitHref={`/submit?category=${slug}`}
      />
    </CategoryShell>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className={`font-mono tabular-nums ${danger ? "text-danger" : "text-text-primary"}`}>
        {value}
      </dd>
    </div>
  );
}

interface TowerPageProps {
  params: Promise<{ category: string }>;
}
