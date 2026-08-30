/**
 * Preview rules for the landing #towers directory.
 *
 * Collapsed "All" shows the featured stacks (one per family). Expanding
 * reveals every stack, still grouped by family. A family chip always
 * shows that family's full list — the user already chose a category.
 */

import { FAMILIES, type Family, type GameCategory } from "../../game/categories";

export function directorySections(input: {
  family: Family | "all";
  expanded: boolean;
  grouped: Record<Family, GameCategory[]>;
  featured: GameCategory[];
}): DirectorySection[] {
  const { family, expanded, grouped, featured } = input;
  if (family === "all" && !expanded) {
    return [{ family: null, stacks: featured }];
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

export type DirectorySection = {
  family: Family | null;
  stacks: GameCategory[];
};
