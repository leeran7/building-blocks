/**
 * CategoryGrid — live "featured towers" on the landing page.
 *
 * Categories are the fine-grained subcategories now (only they get towers). We
 * feature one representative subcategory per family, each linking to its paid
 * tower, with a live block count. A "browse all" link leads to the full index.
 */

import Link from "next/link";
import { FEATURED_GAME_CATEGORIES, type GameCategory } from "../../game/categories";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface CategoryCardData extends GameCategory {
  blockCount: number | null;
}

async function fetchCategoryData(cat: GameCategory): Promise<CategoryCardData> {
  try {
    const res = await fetch(`${BASE_URL}/api/tower/${cat.slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { ...cat, blockCount: null };
    const data = await res.json();
    const visible = (data.blocks ?? []).filter((b: { buried: boolean }) => !b.buried);
    return { ...cat, blockCount: visible.length };
  } catch {
    return { ...cat, blockCount: null };
  }
}

export async function CategoryGrid() {
  const cards = await Promise.all(FEATURED_GAME_CATEGORIES.map(fetchCategoryData));

  return (
    <section aria-label="Featured towers" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
              Featured towers
            </h2>
            <p className="text-sm text-text-muted mt-1">
              One per family. Every subcategory has its own tower.
            </p>
          </div>
          <Link
            href="/browse"
            className="text-sm text-accent hover:brightness-110 whitespace-nowrap"
          >
            Browse all →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.slug}
              href={`/tower/${card.slug}`}
              aria-label={`Browse ${card.label} tower, ${card.blockCount ?? 0} blocks`}
              className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-6 transition-all hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    <h3 className="text-lg font-bold text-text-primary">{card.label}</h3>
                  </div>
                  <span className="text-text-muted text-lg transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>

                <p className="text-xs text-text-muted mt-2">{card.family}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold text-text-primary tabular-nums">
                    {card.blockCount ?? "—"}
                  </span>
                  <span className="text-sm text-text-muted">blocks live</span>
                </div>

                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
                    Also
                  </p>
                  <p className="text-sm font-medium text-accent mt-1">
                    Free skill climb →
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
