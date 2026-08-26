/**
 * CategoryGrid — live "featured towers" on the landing page (ASCENT design).
 *
 * Categories are the fine-grained subcategories now (only they get towers). We
 * feature one representative subcategory per family, each linking to its paid
 * tower, with a live block count rendered as an instrument readout. A "browse
 * all" link leads to the full index.
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
    <section aria-label="Featured towers" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-10 gap-4">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ featured towers ]
            </span>
            <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
              Pick your arena
            </h2>
            <p className="text-sm text-text-muted mt-2">
              One per family. Every subcategory runs its own tower.
            </p>
          </div>
          <Link
            href="/browse"
            className="font-mono text-xs uppercase tracking-[0.14em] text-signal hover:brightness-110 whitespace-nowrap transition"
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
              className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-6 transition-all hover:border-signal/45 hover:-translate-y-1 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              {/* survey grid wash on hover */}
              <div className="pointer-events-none absolute inset-0 survey-grid opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-signal shadow-[0_0_12px_rgb(203_242_77_/_0.6)]" />
                    <h3 className="text-lg font-bold text-text-primary">{card.label}</h3>
                  </div>
                  <span className="font-mono text-text-muted text-lg transition-transform group-hover:translate-x-0.5 group-hover:text-signal">
                    →
                  </span>
                </div>

                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted mt-2">
                  {card.family}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-bold text-text-primary tabular-nums">
                    {card.blockCount ?? "—"}
                  </span>
                  <span className="text-sm text-text-muted">blocks live</span>
                </div>

                <div className="mt-5 pt-4 border-t border-border-subtle flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
                    Free skill climb
                  </span>
                  <span className="text-sm font-semibold text-signal">Play →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
