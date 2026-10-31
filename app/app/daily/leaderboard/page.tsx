/**
 * /daily/leaderboard — today's Daily Climb standings.
 *
 * The Daily stack's Leaderboard tab (its Play tab is /daily), on the same
 * BoardChrome frame as /climb and /duel/leaderboard. Rows are read on the
 * server from the same cached board GET /api/climb/daily/leaderboard serves
 * (topDailyClimbers, 30 s, expired on every verified save); the viewer's own
 * standing is read by the DailyBoard island from that route.
 *
 * The day is the server clock's UTC day, never a request value.
 */

import type { Metadata } from "next";
import { FreeStackShell } from "../../../src/components/FreeStackShell";
import { DailyBoard } from "../../../src/components/Daily/DailyBoard";
import { DailyAbout } from "../../../src/components/Daily/DailyAbout";
import { GameNotes } from "../../../src/components/Game/GameNotes";
import { BoardIntro } from "../../../src/components/Leaderboard/BoardChrome";
import { topDailyClimbers } from "../../../src/db/dailyClimb";
import { utcDayKey } from "../../../src/lib/dailyDay";
import { buildMetadata } from "../../../src/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Daily Climb Leaderboard — Doomstack",
  description:
    "Today's Daily Climb standings. Everyone climbs the same tower each day — your best height today is your rank.",
  path: "/daily/leaderboard",
});

// Per request, so the day rolls over at midnight UTC and a fresh run shows up
// (the board itself is cached per day for 30 s and expired on save).
export const dynamic = "force-dynamic";

export default async function DailyLeaderboardPage() {
  const day = utcDayKey(new Date());
  const board = await topDailyClimbers(day).catch((err: unknown) => {
    console.error("[/daily/leaderboard] board read failed:", err);
    return null;
  });

  return (
    <FreeStackShell
      section="daily-leaderboard"
      title="Daily leaderboard"
      tools={
        <GameNotes stack="Daily Climb" aboutTitle="About the Daily Climb">
          <DailyAbout />
        </GameNotes>
      }
    >
      <BoardIntro eyebrow={`Daily · ${day}`} title="Daily leaderboard">
        {/* About as long as the Endless and 1v1 intros, so it wraps to the
            same lines and the switch under it stays put. */}
        One tower for everyone, new at midnight UTC. Climb it as high as you
        can before the lava catches you — your best height today is your rank.
      </BoardIntro>
      <DailyBoard day={day} climbers={board?.climbers ?? []} unavailable={board === null} />
    </FreeStackShell>
  );
}
