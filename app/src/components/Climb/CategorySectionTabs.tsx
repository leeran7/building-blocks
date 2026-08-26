/**
 * Section switcher shown on a category's pages. Every category has TWO sections:
 *   - "Skill climb" (free) — rank by how high you climb the endless game.
 *   - "Paid tower"  — the leaderboard where you buy altitude.
 * This makes both reachable from either side.
 */

import Link from "next/link";

export type CategorySection = "climb" | "tower";

export function CategorySectionTabs({
  climbSlug,
  towerSlug,
  active,
}: {
  climbSlug: string;
  towerSlug: string;
  active: CategorySection;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
      role="tablist"
      aria-label="Category sections"
    >
      <Tab href={`/climb/${climbSlug}`} label="Skill climb" active={active === "climb"} />
      <Tab href={`/tower/${towerSlug}`} label="Paid tower" active={active === "tower"} />
    </div>
  );
}

function Tab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={
        "px-4 py-1.5 rounded-full text-sm font-semibold transition " +
        (active
          ? "bg-signal text-void"
          : "text-text-secondary hover:text-text-primary")
      }
    >
      {label}
    </Link>
  );
}
