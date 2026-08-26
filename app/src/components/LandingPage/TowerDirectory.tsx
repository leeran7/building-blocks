"use client";

/**
 * TowerDirectory — the landing page's interactive arena directory (ASCENT).
 *
 * The landing owns discovery: a family filter bar over a grid of every tower.
 * Each card is a conversion unit, not a link — it carries a state-aware CTA
 * (empty tower → "Claim #1", active → block count + "Take #1") and offers both
 * the paid tower (card body → /tower/[slug]) and the free game (Play → /play).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { GAME_CATEGORIES, FAMILIES, type Family } from "../../game/categories";

const SHORT_FAMILY: Record<Family, string> = {
  "Tech & Software": "Tech",
  "Design & Creative Tools": "Design",
  "Business & Work": "Business",
  "Media & Arts": "Media",
  "Gaming & Interactive": "Gaming",
  "Science & Research": "Science",
  "Life & Community": "Life",
};

export interface TowerDirectoryProps {
  /** category slug → visible block count */
  counts: Record<string, number>;
  /** minimum entry price in USD (the land-grab hook for empty towers) */
  minEntryUsd: number;
}

export function TowerDirectory({ counts, minEntryUsd }: TowerDirectoryProps) {
  const [family, setFamily] = useState<Family | "all">("all");

  const families = family === "all" ? FAMILIES : [family];
  const grouped = useMemo(() => {
    const out = {} as Record<Family, typeof GAME_CATEGORIES>;
    for (const f of FAMILIES) out[f] = [];
    for (const c of GAME_CATEGORIES) out[c.family].push(c);
    return out;
  }, []);

  // Only count towers actually shown in the directory (game-category slugs), so
  // the header total stays consistent with the cards.
  const totalLive = useMemo(
    () => GAME_CATEGORIES.reduce((a, c) => a + (counts[c.slug] ?? 0), 0),
    [counts]
  );

  return (
    <section id="towers" aria-label="All towers" className="py-20 px-4 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ the arena ]
            </span>
            <h2 className="font-display text-4xl md:text-5xl text-text-primary mt-3">
              Pick your tower
            </h2>
            <p className="text-sm text-text-muted mt-2">
              {GAME_CATEGORIES.length} towers · {totalLive} blocks climbing. Buy your
              way up, or climb the free game.
            </p>
          </div>
        </div>

        {/* Family filter bar */}
        <div
          className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 mb-8"
          role="tablist"
          aria-label="Filter by family"
        >
          <FilterChip active={family === "all"} onClick={() => setFamily("all")}>
            All
          </FilterChip>
          {FAMILIES.map((f) => (
            <FilterChip key={f} active={family === f} onClick={() => setFamily(f)}>
              {SHORT_FAMILY[f]}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-col gap-10">
          {families.map((f) => (
            <div key={f}>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                  {f}
                </h3>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[f].map((c) => (
                  <TowerCard
                    key={c.slug}
                    slug={c.slug}
                    label={c.label}
                    count={counts[c.slug] ?? 0}
                    minEntryUsd={minEntryUsd}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TowerCard({
  slug,
  label,
  count,
  minEntryUsd,
}: {
  slug: string;
  label: string;
  count: number;
  minEntryUsd: number;
}) {
  const empty = count === 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-all hover:border-signal/45 hover:-translate-y-1 hover:shadow-lifted focus-within:border-signal/45">
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Card body → paid tower */}
      <Link
        href={`/tower/${slug}`}
        className="relative block p-5 focus-visible:outline-none"
        aria-label={`${label} paid tower — ${empty ? "claim #1" : `${count} blocks live`}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-signal shadow-[0_0_10px_rgb(203_242_77_/_0.6)] flex-shrink-0" />
            <h4 className="font-semibold text-text-primary truncate">{label}</h4>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-text-muted flex-shrink-0">
            {empty ? "—" : `${count} live`}
          </span>
        </div>

        {/* State-aware CTA — the conversion unit */}
        <div className="mt-4 flex items-baseline gap-1.5">
          {empty ? (
            <>
              <span className="font-mono text-lg font-bold text-signal tabular-nums">
                Claim #1
              </span>
              <span className="text-sm text-text-muted">
                · from ${minEntryUsd.toFixed(0)}
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-lg font-bold text-text-primary">
                Take #1
              </span>
              <span className="text-sm text-text-muted">· buy altitude</span>
            </>
          )}
          <span className="ml-auto text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-signal">
            →
          </span>
        </div>
      </Link>

      {/* Play (free game) — separate affordance */}
      <div className="relative border-t border-border-subtle px-5 py-2.5">
        <Link
          href={`/play/${slug}`}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-signal transition-colors"
          aria-label={`Play the ${label} climb (free)`}
        >
          ▶ Play the climb · free
        </Link>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "flex-shrink-0 rounded-full px-4 min-h-[36px] font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors " +
        (active
          ? "bg-signal text-void"
          : "bg-surface border border-border-strong text-text-muted hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}
