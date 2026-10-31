/**
 * /duel/leaderboard — 1v1 duel standings (free + chip when flag on).
 *
 * Server component. Reads from the DB directly (same pattern as /climb).
 * force-dynamic so a new match shows up immediately after result is saved.
 */

import type { Metadata } from "next";
import { DuelStackShell } from "../../../src/components/Duel/DuelStackShell";
import { ChipDuelLeaderboard } from "../../../src/components/Duel/DuelLeaderboard";
import { DuelBoard } from "../../../src/components/Duel/DuelBoard";
import { BoardIntro } from "../../../src/components/Leaderboard/BoardChrome";
import { topDuelStats } from "../../../src/db/duel";
import { chipLeaderboard } from "../../../src/db/chips";
import { PAID_DUELS_ENABLED } from "../../../src/config/paidDuel";
import { buildMetadata } from "../../../src/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "1v1 Leaderboard — Doomstack",
  description: "Top 1v1 duel players ranked by wins. Free and chip match records.",
  path: "/duel/leaderboard",
});

export default async function DuelLeaderboardPage() {
  const [freeEntries, chipEntries] = await Promise.all([
    topDuelStats(50).catch((err: unknown) => {
      console.error("[/duel/leaderboard] free standings read failed:", err);
      return null;
    }),
    PAID_DUELS_ENABLED
      ? chipLeaderboard(25).catch((err: unknown) => {
          console.error("[/duel/leaderboard] chip standings read failed:", err);
          return null;
        })
      : Promise.resolve([]),
  ]);

  return (
    <DuelStackShell section="leaderboard">
      {/* Same frame as /climb (BoardIntro + DuelBoard on BoardChrome), so the
          Solo | 1v1 switch between them only swaps the words and the rows.
          py-6 matches FreeStackShell's leaderboard padding. */}
      <div className="climb-reveal py-6">
        <BoardIntro eyebrow="1v1 · head to head" title="1v1 leaderboard">
          One leaderboard for 1v1 duels. Race a rival up the same tower before
          the lava catches you — every match you win moves you up the board.
        </BoardIntro>

        <DuelBoard entries={freeEntries ?? []} unavailable={freeEntries === null}>
          {/* Chip duels — only rendered when paid features are on */}
          {PAID_DUELS_ENABLED && (
            <section className="mt-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal mb-1">
                [ ranked chips ]
              </p>
              <h2 className="font-display text-2xl font-bold text-text-primary mb-5">
                Chip Duels
              </h2>
              <ChipDuelLeaderboard
                entries={(chipEntries ?? []).map((e) => ({
                  userId: e.userId,
                  displayName: e.displayName,
                  chipWins: e.chipWins,
                  chipLosses: e.chipLosses,
                  netChips: e.totalChipsWon,
                }))}
                unavailable={chipEntries === null}
              />
            </section>
          )}
        </DuelBoard>
      </div>
    </DuelStackShell>
  );
}
