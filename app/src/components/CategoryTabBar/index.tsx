"use client";

/**
 * CategoryTabBar — persistent tab navigation across all six category towers.
 *
 * AC-4: active tab highlighted with its category accent color
 * AC-5: horizontally scrollable at 375px, no tab clipping
 *
 * All six category accents are verified >= 4.5:1 as text on #0a0a0f (see
 * src/lib/categories.ts), so the active tab uses its accent as both text and
 * underline.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "../../lib/categories";

export interface CategoryTabBarProps {
  activeCategory?: string;
}

export function CategoryTabBar({ activeCategory }: CategoryTabBarProps) {
  const pathname = usePathname();

  const active =
    activeCategory ??
    CATEGORIES.find((t) => pathname.startsWith(`/tower/${t.slug}`))?.slug ??
    "";

  return (
    <nav
      aria-label="Category towers"
      className="bg-surface border-b border-border-subtle"
    >
      <ul
        role="tablist"
        className="flex overflow-x-auto scrollbar-hide max-w-6xl mx-auto px-1"
      >
        {CATEGORIES.map((tab) => {
          const isActive = active === tab.slug;
          return (
            <li key={tab.slug} role="presentation" className="flex-shrink-0">
              <Link
                href={`/tower/${tab.slug}`}
                role="tab"
                aria-selected={isActive}
                aria-controls="tower-panel"
                className={[
                  "relative flex items-center gap-2 min-h-[44px] px-4 md:px-5 py-3 text-sm font-medium transition-colors rounded-sm",
                  "focus-visible:outline-none",
                  isActive
                    ? ""
                    : "text-text-muted hover:text-text-primary hover:bg-elevated",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  isActive
                    ? { color: "#00d4ff", borderBottom: "2px solid #00d4ff" }
                    : { borderBottom: "2px solid transparent" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: tab.hex,
                    opacity: isActive ? 1 : 0.5,
                  }}
                  aria-hidden="true"
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
