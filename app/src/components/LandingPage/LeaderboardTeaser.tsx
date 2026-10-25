/**
 * LeaderboardTeaser — the landing's leaderboard block (ASCENT design).
 *
 * The landing leads with the climb (plan "Doomstack to 8/10", decision D1), so
 * only the free board's top 3 shows here. Chip duels and cash tournaments
 * live on their own pages; when they are on, a single plain link points
 * there and carries their disclosure (18+, not in all states), as every
 * entry point to them must.
 *
 * Server component. The free board keeps its own async server read
 * (topFreeClimbers, `.catch(() => [])`) and its empty state; it is awaited
 * here so the block renders as one already-resolved tree.
 */

import Link from "next/link";
import { FreeLeaderboard } from "./FreeLeaderboard";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";

export async function LeaderboardTeaser() {
  const freeBoard = await FreeLeaderboard();

  return (
    <section
      aria-label="Leaderboards"
      className="scroll-reveal relative py-20 px-4 border-t border-border-subtle"
    >
      <div className="max-w-5xl mx-auto">
        {freeBoard}
        {PAID_DUELS_ENABLED_PUBLIC && (
          <p data-paid-modes-link className="mt-6 text-sm text-text-secondary">
            <Link
              href="/duel/chips"
              className="inline-flex min-h-[44px] items-center font-semibold text-text-primary underline underline-offset-4 hover:text-signal"
            >
              Chip duels and cash tournaments →
            </Link>{" "}
            Skill-based, 18+, not available in all states.
          </p>
        )}
      </div>
    </section>
  );
}
