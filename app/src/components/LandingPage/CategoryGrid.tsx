/**
 * CategoryGrid — live "featured towers" on the landing page.
 *
 * AC-27: exactly 6 category cards
 * AC-28: each card shows live block count + top block name
 * AC-29: API failure → placeholder "—", no crash
 *
 * Cards are themed per category via categoryTheme() so `text-accent`/`bg-accent`
 * resolve to each tower's color. The curated six are the "featured" set; the
 * category system itself is infinite-ready (see src/lib/categories.ts).
 */

import Link from "next/link";
import { FEATURED_CATEGORIES, categoryTheme, type Category } from "../../lib/categories";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface CategoryCardData extends Category {
  blockCount: number | null;
  topBlockName: string | null;
}

async function fetchCategoryData(cat: Category): Promise<CategoryCardData> {
  try {
    const res = await fetch(`${BASE_URL}/api/tower/${cat.slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { ...cat, blockCount: null, topBlockName: null };
    const data = await res.json();
    const visibleBlocks = (data.blocks ?? []).filter(
      (b: { buried: boolean }) => !b.buried
    );
    const topBlock = visibleBlocks[0] as { display_name?: string } | undefined;
    return {
      ...cat,
      blockCount: visibleBlocks.length,
      topBlockName: topBlock?.display_name ?? null,
    };
  } catch {
    return { ...cat, blockCount: null, topBlockName: null };
  }
}

export async function CategoryGrid() {
  const cards = await Promise.all(FEATURED_CATEGORIES.map(fetchCategoryData));

  return (
    <section aria-label="Category towers" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
              Live towers
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Six arenas. Pick your fight.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.slug}
              href={`/tower/${card.slug}`}
              aria-label={`Browse ${card.label} tower, ${card.blockCount ?? 0} blocks`}
              style={categoryTheme(card)}
              className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface p-6 transition-all hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {/* Accent wash on hover */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background:
                    "radial-gradient(120% 80% at 0% 0%, rgb(var(--accent-rgb) / 0.10), transparent 60%)",
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    <h3 className="text-lg font-bold text-text-primary">
                      {card.label}
                    </h3>
                  </div>
                  <span className="text-text-muted text-lg transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>

                <p className="text-xs text-text-muted mt-2">{card.blurb}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold text-text-primary tabular-nums">
                    {card.blockCount ?? "—"}
                  </span>
                  <span className="text-sm text-text-muted">blocks live</span>
                </div>

                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase tracking-[0.15em]">
                    Leader
                  </p>
                  <p className="text-sm font-medium text-accent truncate mt-1">
                    {card.topBlockName ??
                      (card.blockCount === 0 ? "No blocks yet" : "—")}
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
