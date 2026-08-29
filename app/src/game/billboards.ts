/**
 * Paid-stack billboards in the climb.
 *
 * Buying altitude places a hanging sign in the free climb at the metres you
 * paid for. Cosmetic only — the simulation never reads these (replay stays
 * deterministic; a live economy must not change physics). X is keyed on slug
 * so a brand keeps the same spot across runs.
 */

import { createRng } from "./rng";

/** Horizontal inset so signs sit on the playable width, not the walls. */
const EDGE_FRAC = 0.08;

/** Horizontal centre of a billboard, deterministic in (slug, tower width). */
export function signX(towerWidthM: number, slug: string): number {
  const r = createRng(`billboard:${slug}`);
  const margin = towerWidthM * EDGE_FRAC;
  return margin + r.next() * (towerWidthM - 2 * margin);
}

/** Keep signs with a real paid height; unpaid (altitude 0) listings stay off the climb. */
export function visibleBillboards(signs: Billboard[]): Billboard[] {
  return signs.filter((s) => s.altitude > 0 && s.slug.length > 0);
}

export interface Billboard {
  slug: string;
  display_name: string;
  url: string;
  altitude: number;
  category: string;
}
