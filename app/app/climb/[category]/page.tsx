/**
 * Skill-climb leaderboard page — /climb/[category]
 *
 * The FREE, skill-based section of a category: players ranked by how high they
 * climb the endless game (peak height = score). Its sibling is the paid tower
 * (/tower/[category]) where you buy altitude — every category has both, and the
 * section switcher moves between them.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CategoryShell } from "../../../src/components/CategoryShell";
import { ClimbLeaderboard } from "../../../src/components/Climb/ClimbLeaderboard";
import { resolveGameCategory } from "../../../src/game/categories";
import { topClimbers } from "../../../src/db/climb";

interface ClimbPageProps {
  params: { category: string };
}

export function generateMetadata({ params }: ClimbPageProps): Metadata {
  const cat = resolveGameCategory(params.category);
  return {
    title: `${cat.label} — Skill Climb Leaderboard — Stack`,
    description: `Free skill leaderboard for ${cat.label}: climb the endless stack as high as you can. Your peak height is your rank.`,
  };
}

export default async function ClimbPage({ params }: ClimbPageProps) {
  const category = resolveGameCategory(params.category);
  const climbers = await topClimbers(category.slug).catch(() => []);

  return (
    <CategoryShell
      slug={category.slug}
      section="climb"
      eyebrow={`Skill climb · ${category.family}`}
      title={category.label}
      meta={
        <div className="mt-3">
          <p className="text-text-secondary text-sm max-w-lg">
            Free to play. Climb the endless {category.label} stack as high as you can
            before the lava catches you — your best height is your rank.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/play/${category.slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-accent text-void font-semibold px-6 min-h-[44px] hover:brightness-110 transition"
            >
              Play the climb
            </Link>
            <Link
              href={`/stack/${category.slug}`}
              className="text-text-secondary hover:text-text-primary text-sm underline underline-offset-4"
            >
              or buy your way to the top →
            </Link>
          </div>
        </div>
      }
    >
      <ClimbLeaderboard climbers={climbers} />
    </CategoryShell>
  );
}
