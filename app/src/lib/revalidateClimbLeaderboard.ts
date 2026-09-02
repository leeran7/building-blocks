/**
 * Invalidate cached free-climb leaderboard pages after a run is persisted.
 *
 * /climb and the landing page embed leaderboard data via server components.
 * Without on-demand revalidation, ISR (30–60s) and the client router cache
 * can serve stale standings until the window expires — several reloads after a run.
 */

import { revalidatePath } from "next/cache";

/** Paths that render `topFreeClimbers` / `getGlobalClimbStats`. */
const CLIMB_LEADERBOARD_PATHS = ["/climb", "/"] as const;

export function revalidateClimbLeaderboard(): void {
  for (const path of CLIMB_LEADERBOARD_PATHS) {
    revalidatePath(path);
  }
}
