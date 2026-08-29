"use client";

/**
 * TowerDirectory — the landing page's paid stack directory (ASCENT).
 *
 * Paid stacks only: card body expands the live paid leaderboard inline.
 * The free climb game lives on its own stack — see FreeLeaderboard below.
 */

import { useMemo, useState } from "react";
import { GAME_CATEGORIES, FAMILIES, type Family } from "../../game/categories";
import { InlineTower } from "./InlineTower";

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
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const families = family === "all" ? FAMILIES : [family];
  const grouped = useMemo(() => {
    const out = {} as Record<Family, typeof GAME_CATEGORIES>;
    for (const f of FAMILIES) out[f] = [];
    for (const c of GAME_CATEGORIES) out[c.family].push(c);
    for (const f of FAMILIES) {
      out[f].sort((a, b) => {
        const d = (counts[b.slug] ?? 0) - (counts[a.slug] ?? 0);
        if (d !== 0) return d;
        return a.label.localeCompare(b.label);
      });
    }
    return out;
  }, [counts]);

  const totalLive = useMemo(
    () => GAME_CATEGORIES.reduce((a, c) => a + (counts[c.slug] ?? 0), 0),
    [counts]
  );

  return (
    <section id="towers" aria-label="Paid stacks" className="py-20 px-4 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
            <span className="rounded-full bg-signal text-void px-2 py-0.5 text-[10px] font-bold shadow-signal">
              Paid
            </span>
            real stakes · buy your way up
          </span>
          <h2 className="font-display text-5xl md:text-6xl text-text-primary mt-3">
            Pick your stack
          </h2>
          <p className="text-sm text-text-secondary mt-2 max-w-2xl">
            {GAME_CATEGORIES.length} stacks · {totalLive} blocks climbing. Buy
            altitude to claim your rank — your height is permanent, and it hangs
            in the free climb at those metres. The ground rises to bury whoever
            stops topping up. Open a stack to see the standings.
          </p>
        </div>

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
                {grouped[f].map((c) => {
                  const isOpen = openSlug === c.slug;
                  return (
                    <TowerCardWithPanel key={c.slug}>
                      <TowerCard
                        slug={c.slug}
                        label={c.label}
                        count={counts[c.slug] ?? 0}
                        minEntryUsd={minEntryUsd}
                        isOpen={isOpen}
                        onToggle={() => setOpenSlug(isOpen ? null : c.slug)}
                      />
                      {isOpen && (
                        <InlineTower
                          slug={c.slug}
                          label={c.label}
                          onClose={() => setOpenSlug(null)}
                        />
                      )}
                    </TowerCardWithPanel>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TowerCardWithPanel({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TowerCard({
  label,
  count,
  minEntryUsd,
  isOpen,
  onToggle,
}: {
  slug: string;
  label: string;
  count: number;
  minEntryUsd: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const empty = count === 0;
  return (
    <div
      className={
        "group relative overflow-hidden rounded-2xl border bg-surface transition-all " +
        (isOpen
          ? "border-signal/50 shadow-signal"
          : "border-border-subtle hover:border-signal/45 hover:-translate-y-1 hover:shadow-lifted")
      }
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-0 group-hover:opacity-100 transition-opacity" />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="relative block w-full text-left p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-2xl"
        aria-label={`${label} stack — ${empty ? "claim #1" : `${count} blocks live`}`}
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
          <span
            className={
              "ml-auto text-text-muted transition-transform " +
              (isOpen ? "rotate-90 text-signal" : "group-hover:translate-x-0.5 group-hover:text-signal")
            }
            aria-hidden="true"
          >
            →
          </span>
        </div>
      </button>
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
