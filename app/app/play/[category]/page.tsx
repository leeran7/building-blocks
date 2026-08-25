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
import { Navbar } from "../../../src/components/Navbar";
import { ClimbScene } from "../../../src/components/Game/ClimbScene";
import { buildTower } from "../../../src/game/towers";
import { resolveGameCategory } from "../../../src/game/categories";

interface PlayPageProps {
  params: { category: string };
}

export function generateMetadata({ params }: PlayPageProps): Metadata {
  const cat = resolveGameCategory(params.category);
  return {
    title: `Climb the ${cat.label} tower — Tower`,
    description: `Solo time-trial: race the rising lava to the summit flag of the ${cat.label} tower.`,
  };
}

export default function PlayPage({ params }: PlayPageProps) {
  const category = resolveGameCategory(params.category);
  const tower = buildTower(category);

  return (
    <main className="min-h-screen bg-void">
      <Navbar contextLabel={`${category.label} climb`} />
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col items-center">
        <header className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-accent font-medium">
            The Climb · {category.family}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mt-2">
            {category.label} tower
          </h1>
          <p className="text-text-secondary mt-2 max-w-md">
            First to the flag wins. Keyboard: arrows / WASD to move & climb, Space
            to jump. On touch, use the on-screen pad.
          </p>
        </header>

        <ClimbScene tower={tower} categoryLabel={category.label} />
      </div>
    </main>
  );
}
