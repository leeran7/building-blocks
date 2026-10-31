"use client";

/**
 * DuelBoard — the /duel/leaderboard standings surface, built on the same
 * frame as /climb's ClimbBoard (BoardChrome): the Solo | 1v1 switch, then a
 * search row and the ranked rows beside a "your 1v1 record" panel that carries
 * the page's one primary action. Going back and forth between the two boards
 * only swaps the words and the rows.
 *
 * The standings stay server-rendered and are passed in; this island exists for
 * the client-side search and the viewer's own record (useDuelStats).
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { useDuelStats } from "../../hooks/useDuelStats";
import type { DuelStatsRow } from "../../db/duel";
import { DUEL_HREF, SIGNIN_HREF } from "../navLinks";
import {
  BoardCta,
  BoardFindMe,
  BoardLayout,
  BoardNoMatch,
  BoardSearch,
  StandingPanel,
} from "../Leaderboard/BoardChrome";
import { FreeDuelLeaderboard, YOUR_DUEL_ROW_ID, type RankedDuelRow } from "./DuelLeaderboard";

export function DuelBoard({
  entries,
  unavailable = false,
  children,
}: {
  /** The free 1v1 standings, best first. */
  entries: DuelStatsRow[];
  unavailable?: boolean;
  /** More boards under the free one, in the same column (chip duels). */
  children?: ReactNode;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  // Rank by place on the whole board, so a search doesn't renumber the rows.
  const ranked = useMemo<RankedDuelRow[]>(
    () => entries.map((e, i) => ({ ...e, rank: i + 1 })),
    [entries]
  );
  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (trimmed.length === 0) return ranked;
    const needle = trimmed.toLowerCase();
    return ranked.filter((e) => (e.displayName ?? "").toLowerCase().includes(needle));
  }, [ranked, trimmed]);
  const noMatches = !unavailable && entries.length > 0 && filtered.length === 0;
  const viewerId = user?.uid ?? null;
  const viewerInBoard = viewerId !== null && entries.some((e) => e.userId === viewerId);

  return (
    <BoardLayout scope="1v1" panel={<YourDuelRecordPanel />}>
      {!unavailable && entries.length > 0 && (
        <BoardSearch id="duelist-search" label="Find a player" value={query} onChange={setQuery}>
          {viewerInBoard && (
            <BoardFindMe rowId={YOUR_DUEL_ROW_ID} onClearSearch={() => setQuery("")} />
          )}
        </BoardSearch>
      )}
      {noMatches ? (
        <BoardNoMatch query={trimmed} noun="player" onClear={() => setQuery("")} />
      ) : (
        <FreeDuelLeaderboard
          entries={filtered}
          unavailable={unavailable}
          highlightUserId={viewerId}
        />
      )}
      {children}
    </BoardLayout>
  );
}

// Same tones in the same order as the Solo panel's (Your rank, Climbers).
const DUEL_STATS = [
  { label: "Win rate", tone: "signal" },
  { label: "Streak", tone: "secondary" },
] as const;

/** Whole-percent win rate, or a dash before the first finished match. */
function winRate({ wins, losses }: { wins: number; losses: number }): string {
  const played = wins + losses;
  return played === 0 ? "—" : `${Math.round((wins / played) * 100)}%`;
}

/** The viewer's free 1v1 record and the page's one primary action. */
function YourDuelRecordPanel() {
  const { user, isAnonymous, loading } = useAuth();
  const stats = useDuelStats();
  // Anonymous sessions can't duel (see DuelHome): they get the sign-in line.
  const signedIn = !loading && !!user && !isAnonymous;

  return (
    <StandingPanel
      label="Your 1v1 record"
      signedIn={signedIn}
      pending={signedIn && stats === undefined}
      unit="wins"
      stats={DUEL_STATS}
      record={
        stats
          ? {
              value: stats.wins,
              stats: [
                winRate(stats),
                stats.current_streak > 0 ? `+${stats.current_streak}` : stats.current_streak,
              ],
            }
          : null
      }
      message={
        loading ? (
          "Checking your record…"
        ) : !signedIn ? (
          <>
            <Link
              href={`${SIGNIN_HREF}?redirect=%2Fduel%2Fleaderboard`}
              className="text-signal underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to record your 1v1 wins and take a rank.
          </>
        ) : (
          "Your record couldn’t be loaded right now."
        )
      }
      cta={<BoardCta href={DUEL_HREF}>Play a 1v1</BoardCta>}
    />
  );
}
