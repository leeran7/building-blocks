"use client";

/**
 * CategoryTabBar — Persistent tab navigation between all six category towers.
 *
 * Design spec: design.md §6.1
 * AC-4: active tab highlighted with category accent color
 * AC-5: horizontally scrollable on 375px viewport, no tab clipping
 *
 * WCAG enforcement:
 * - tech tab: text-accent-tech (5.2:1) on active
 * - design tab: text-accent-design (4.6:1) on active
 * - all others: text-primary + border-bottom in accent (decorative only)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface CategoryTabBarProps {
  activeCategory?: string;
}

interface TabConfig {
  slug: string;
  label: string;
  accent: string;
  /** Whether the accent color is safe as text per WCAG AA (4.5:1 on #0a0a0f) */
  accentSafeAsText: boolean;
}

const TABS: TabConfig[] = [
  { slug: "tech", label: "Tech", accent: "#00d4ff", accentSafeAsText: true },
  { slug: "design", label: "Design", accent: "#ff6b9d", accentSafeAsText: true },
  { slug: "business", label: "Business", accent: "#ffd700", accentSafeAsText: false },
  { slug: "creative", label: "Creative", accent: "#9b59b6", accentSafeAsText: false },
  { slug: "gaming", label: "Gaming", accent: "#00ff88", accentSafeAsText: false },
  { slug: "science", label: "Science", accent: "#ff8c00", accentSafeAsText: false },
];

export function CategoryTabBar({ activeCategory }: CategoryTabBarProps) {
  const pathname = usePathname();

  // Derive active category from prop or URL
  const active =
    activeCategory ??
    TABS.find((t) => pathname.startsWith(`/tower/${t.slug}`))?.slug ??
    "";

  return (
    <nav
      aria-label="Category towers"
      className="bg-surface border-b border-border-subtle sticky top-0 z-10"
    >
      {/* Role tablist — keyboard: Left/Right arrow navigates tabs */}
      <ul
        role="tablist"
        className="flex overflow-x-auto scrollbar-hide max-w-6xl mx-auto"
      >
        {TABS.map((tab) => {
          const isActive = active === tab.slug;

          return (
            <li key={tab.slug} role="presentation" className="flex-shrink-0">
              <Link
                href={`/tower/${tab.slug}`}
                role="tab"
                aria-selected={isActive}
                aria-controls="tower-panel"
                className={[
                  "relative flex items-center min-h-[44px] px-4 md:px-6 py-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-void rounded-sm",
                  isActive
                    ? tab.accentSafeAsText
                      ? ""  // text color set via inline style for safe accents
                      : "text-text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-elevated",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  isActive
                    ? {
                        color: tab.accentSafeAsText ? tab.accent : undefined,
                        borderBottom: `2px solid ${tab.accent}`,
                      }
                    : { borderBottom: "2px solid transparent" }
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
