"use client";

/**
 * CategoryNav — the app's category switcher. Categories are ALWAYS the
 * fine-grained subcategories (74), never the old 6 broad ones. Instead of a
 * fixed tab bar, this is a scrollable list with family filters, shown inline on
 * every category page so you can jump between subcategories without visiting
 * /browse first.
 *
 * `section` decides where each item links (skill climb / paid tower / play), so
 * switching category keeps you in the same section.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { GAME_CATEGORIES, FAMILIES, type Family } from "../game/categories";

const SHORT_FAMILY: Record<Family, string> = {
  "Tech & Software": "Tech",
  "Design & Creative Tools": "Design",
  "Business & Work": "Business",
  "Media & Arts": "Media",
  "Gaming & Interactive": "Gaming",
  "Science & Research": "Science",
  "Life & Community": "Life",
};

export function CategoryNav({
  active,
  section,
}: {
  active: string;
  section: "climb" | "tower" | "play";
}) {
  // Default the family filter to whichever family contains the active category.
  const activeFamily = useMemo(
    () => GAME_CATEGORIES.find((c) => c.slug === active)?.family ?? null,
    [active]
  );
  const [family, setFamily] = useState<Family | "all">(activeFamily ?? "all");

  const cats = useMemo(
    () =>
      family === "all"
        ? GAME_CATEGORIES
        : GAME_CATEGORIES.filter((c) => c.family === family),
    [family]
  );

  return (
    <nav aria-label="Categories" className="bg-surface border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-3 py-2 flex flex-col gap-2">
        {/* Family filters. */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          <FilterChip active={family === "all"} onClick={() => setFamily("all")}>
            All
          </FilterChip>
          {FAMILIES.map((f) => (
            <FilterChip key={f} active={family === f} onClick={() => setFamily(f)}>
              {SHORT_FAMILY[f]}
            </FilterChip>
          ))}
        </div>

        {/* Scrollable subcategory list. */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {cats.map((c) => {
            const isActive = c.slug === active;
            return (
              <Link
                key={c.slug}
                href={`/${section}/${c.slug}`}
                aria-current={isActive ? "page" : undefined}
                className={
                  "flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 min-h-[34px] text-sm font-medium transition-colors " +
                  (isActive
                    ? "bg-signal text-void"
                    : "text-text-secondary hover:text-text-primary hover:bg-elevated")
                }
              >
                <span
                  className={
                    "w-1.5 h-1.5 rounded-full flex-shrink-0 " +
                    (isActive ? "bg-void" : "bg-signal")
                  }
                  aria-hidden="true"
                />
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
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
      onClick={onClick}
      className={
        "flex-shrink-0 rounded-full px-3 min-h-[30px] font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors " +
        (active
          ? "bg-signal/15 text-signal"
          : "text-text-muted hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}
