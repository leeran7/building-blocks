/**
 * Preview rules for the landing #towers directory.
 *
 * Collapsed "All" shows the first DEFAULT_VISIBLE_STACKS stacks (at least
 * 9, filling three desktop rows). Expanding reveals every stack, still
 * grouped by family. A family chip always shows that family's full list —
 * the user already chose a category.
 */

import { FAMILIES, type Family, type GameCategory } from "../../game/categories";

/** Collapsed All preview. 9 fills three rows of the lg 3-column grid. */
export const DEFAULT_VISIBLE_STACKS = 9;

export function directorySections(input: {
  family: Family | "all";
  expanded: boolean;
  grouped: Record<Family, GameCategory[]>;
  previewCount?: number;
}): DirectorySection[] {
  const previewCount = input.previewCount ?? DEFAULT_VISIBLE_STACKS;
  const { family, expanded, grouped } = input;
  if (family === "all" && !expanded) {
    return previewSections(grouped, previewCount);
  }
  const families = family === "all" ? FAMILIES : [family];
  return families.map((f) => ({
    family: f,
    stacks: Object.hasOwn(grouped, f) ? grouped[f] : [],
  }));
}

export function hiddenDirectoryCount(
  total: number,
  previewCount: number,
  expanded: boolean,
  family: Family | "all"
): number {
  if (family !== "all" || expanded) return 0;
  return Math.max(0, total - previewCount);
}

export function directoryToggleVisible(input: {
  family: Family | "all";
  expanded: boolean;
  hiddenCount: number;
}): boolean {
  if (input.family !== "all") return false;
  return input.expanded || input.hiddenCount > 0;
}

function previewSections(
  grouped: Record<Family, GameCategory[]>,
  limit: number
): DirectorySection[] {
  let remaining = Math.max(0, limit);
  const out: DirectorySection[] = [];
  for (const f of FAMILIES) {
    if (remaining <= 0) break;
    const all = Object.hasOwn(grouped, f) ? grouped[f] : [];
    const stacks = all.slice(0, remaining);
    if (stacks.length === 0) continue;
    out.push({ family: f, stacks });
    remaining -= stacks.length;
  }
  return out;
}

export type DirectorySection = {
  family: Family;
  stacks: GameCategory[];
};
