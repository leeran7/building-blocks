/**
 * Section switcher on paid category pages. The free climb is a separate stack —
 * link out to the game (FREE_CLIMB_HREF) instead of a per-category skill leaderboard.
 */

import Link from "next/link";
import { FREE_CLIMB_HREF } from "../navLinks";

export type CategorySection = "tower";

export function CategorySectionTabs({
  towerSlug,
}: {
  towerSlug: string;
  /** @deprecated Free climb is no longer per-category */
  climbSlug?: string;
  active?: CategorySection;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface p-1"
      role="tablist"
      aria-label="Category sections"
    >
      <Tab href={`/stack/${towerSlug}`} label="Paid stack" active />
      <Tab href={FREE_CLIMB_HREF} label="Free climb" active={false} />
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
