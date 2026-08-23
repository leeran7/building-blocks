/**
 * CategoryGrid — Live category cards on the landing page.
 *
 * Design spec: design.md §6.6
 * Server component — fetches data at render time.
 *
 * AC-28: Each card shows live block count + top block name
 * AC-29: API failure → placeholder "--", no crash
 * WCAG: accent used as border-top only (decorative), not as text
 */

import type React from "react";
import Link from "next/link";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface CategoryConfig {
  slug: string;
  label: string;
  accent: string;
}

const CATEGORIES: CategoryConfig[] = [
  { slug: "tech", label: "Tech", accent: "#00d4ff" },
  { slug: "design", label: "Design", accent: "#ff6b9d" },
  { slug: "business", label: "Business", accent: "#ffd700" },
  { slug: "creative", label: "Creative", accent: "#9b59b6" },
  { slug: "gaming", label: "Gaming", accent: "#00ff88" },
  { slug: "science", label: "Science", accent: "#ff8c00" },
];

interface CategoryCardData {
  slug: string;
  label: string;
  accent: string;
  blockCount: number | null;
  topBlockName: string | null;
}

async function fetchCategoryData(cat: CategoryConfig): Promise<CategoryCardData> {
  try {
    const res = await fetch(`${BASE_URL}/api/tower/${cat.slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { ...cat, blockCount: null, topBlockName: null };
    }
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
  // Fetch all 6 categories in parallel (AC-29: individual failures are graceful)
  const cards = await Promise.all(CATEGORIES.map(fetchCategoryData));

  return (
    <section aria-label="Category towers" className="py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold text-text-primary mb-8">
          Live towers
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Link
              key={card.slug}
              href={`/tower/${card.slug}`}
              aria-label={`Browse ${card.label} tower, ${card.blockCount ?? 0} blocks`}
              className="group bg-surface rounded-xl p-6 border border-border-subtle hover:scale-[1.01] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              style={
                {
                  "--card-accent": card.accent,
                  borderTop: `4px solid ${card.accent}`,
                } as React.CSSProperties
              }
            >
              {/* Category name */}
              <h3 className="text-xl font-semibold text-text-primary">
                {card.label}
              </h3>

              {/* Block count */}
              <div className="mt-2">
                <span
                  className="font-mono text-2xl font-bold text-text-primary"
                  aria-label={`${card.blockCount ?? 0} blocks live`}
                >
                  {card.blockCount ?? "—"}
                </span>
                <span className="text-sm text-text-muted ml-2">blocks live</span>
              </div>

              {/* Top block */}
              <div className="mt-3">
                <p className="text-xs text-text-muted">Top block</p>
                <p className="text-sm font-medium text-text-primary truncate mt-0.5">
                  {card.topBlockName ?? (card.blockCount === 0 ? "No blocks yet" : "—")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
