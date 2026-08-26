/**
 * Solo climb page — /play/[category]  (Tower v3 "The Climb", Phase 1 MVP)
 *
 * A playable solo time-trial: climb the category's themed tower to the summit
 * flag before the rising hazard catches you. No account or payment required to
 * play (spec-next.md Phase 1 — free, no paywall, no login wall); a signed-in
 * player's peak-height record is saved best-effort from the client.
 *
 * The tower is built deterministically from the category slug via the archetype
 * builder, so any slug — curated or derived — yields a playable tower (AC-21).
 */

import type { Metadata } from "next";
import { CategoryShell } from "../../../src/components/CategoryShell";
import { ClimbScene } from "../../../src/components/Game/ClimbScene";
import { buildTower } from "../../../src/game/towers";
import { resolveGameCategory } from "../../../src/game/categories";

interface PlayPageProps {
  params: { category: string };
}

export function generateMetadata({ params }: PlayPageProps): Metadata {
  const cat = resolveGameCategory(params.category);
  return {
    title: `Climb the ${cat.label} stack — Stack`,
    description: `Endless climb: go as high as you can up the ${cat.label} stack before the rising lava catches you.`,
  };
}

export default function PlayPage({ params }: PlayPageProps) {
  const category = resolveGameCategory(params.category);
  const tower = buildTower(category);

  return (
    <CategoryShell
      slug={category.slug}
      section="play"
      eyebrow={`The Climb · ${category.family}`}
      title={category.label}
      meta={
        <p className="text-text-secondary text-sm mt-3 max-w-lg">
          Endless climb — go as high as you can. Arrow keys / WASD to move & climb,
          Space to jump. It gets harder the higher you go; your peak height is your
          score.
        </p>
      }
    >
      <div className="flex justify-center">
        <ClimbScene tower={tower} categoryLabel={category.label} />
      </div>
    </CategoryShell>
  );
}
