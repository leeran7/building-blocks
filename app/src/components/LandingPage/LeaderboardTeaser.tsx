/**
 * LeaderboardTeaser — merged landing leaderboard block (ASCENT design).
 *
 * Replaces the two full stacked leaderboard sections (RankedLeaderboard +
 * FreeLeaderboard) with ONE compact block: top-3 per board as a teaser, each
 * keeping its own "Full leaderboard →" link (Free → /climb, Ranked →
 * /duel/leaderboard). When paid duels are OFF (default) only the free board
 * renders — one option isn't a choice, so there is no lone tab. When ON, free
 * and ranked sit side by side and the ranked-chips + tournaments explainer
 * (the single callout relocated from the removed DuelPromo) rides above them.
 *
 * Server component. Each board keeps its own async server read
 * (topFreeClimbers / chipLeaderboard, each `.catch(() => [])`) and its existing
 * empty state. The child components are awaited here so the merged block renders
 * as one already-resolved tree — no data fetching moves to the client, no new
 * endpoint, and the boards' degrade behaviour is preserved byte-for-byte.
 */

import { FreeLeaderboard } from "./FreeLeaderboard";
import { RankedLeaderboard } from "./RankedLeaderboard";
import {
  PAID_DUELS_ENABLED,
  PAID_DUELS_ENABLED_PUBLIC,
} from "../../config/paidDuel";

function CoinsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </svg>
  );
}

export async function LeaderboardTeaser() {
  // Awaited (not rendered as <Element/>) so the boards' data is resolved into
  // this tree — the block ships as one server-rendered unit.
  const freeBoard = await FreeLeaderboard();
  const rankedBoard = PAID_DUELS_ENABLED ? await RankedLeaderboard() : null;

  return (
    <section
      aria-label="Leaderboards"
      className="scroll-reveal relative py-20 px-4 border-t border-border-subtle"
    >
      <div className="max-w-5xl mx-auto">
        {PAID_DUELS_ENABLED_PUBLIC && (
          <div className="reveal mb-8 rounded-2xl border border-signal/40 bg-signal/5 p-5 shadow-signal">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 shrink-0 rounded-xl border border-signal/40 bg-signal/10 text-signal flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6">
                <CoinsIcon />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  Ranked chip duels + tournaments
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed mt-1.5">
                  Stake non-cashable chips in ranked 1v1s, or enter bracket
                  tournaments for real cash prizes. Skill-based, 18+, not
                  available in all states.
                </p>
              </div>
            </div>
          </div>
        )}

        <div
          className={
            rankedBoard
              ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch"
              : ""
          }
        >
          {freeBoard}
          {rankedBoard}
        </div>
      </div>
    </section>
  );
}
