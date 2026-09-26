import type { RefObject } from "react";
import {
  useDailyLeaderboard,
  useFriendsDailyLeaderboard,
  useFriendsLeaderboard,
  useLeaderboard,
  type FriendsBoard,
} from "../contexts/AppDataContext";
import type { DailyStanding, FriendsDailyBoard } from "../lib/dailyBoard";
import type { BoardRow } from "../lib/leaderboard";
import type { Period, Scope } from "../components/ranks/RanksTabs";
import { useRetry, type UseRetry } from "./useRetry";

/** What the screen needs from whichever board is on screen. */
export interface ActiveBoard {
  /** Pull-to-refresh for this board only. */
  refresh: () => Promise<void>;
  /** This board's own retry state: a retry never paints over another tab. */
  retry: UseRetry;
  hasData: boolean;
  climbers: readonly BoardRow[];
}

export interface RanksBoards {
  active: ActiveBoard;
  /** The player's own row on today's public board (Today · Global only). */
  todayMe: DailyStanding | null;
  /** The Friends board for the period (hidden and not-yet-climbed counts). */
  friendsBoard: FriendsBoard | FriendsDailyBoard | null;
}

/**
 * The four Ranks boards (Endless | Daily x Global | Friends) behind one
 * lookup, `boards[period][scope]` (RV-DC-7), instead of a nested ternary per
 * field. Every board keeps its own cache slice and retry; the Friends and
 * Daily boards fetch only while their tab is open.
 */
export function useRanksBoards({
  period,
  scope,
  day,
  focusOnRecover,
}: {
  period: Period;
  scope: Scope;
  /** The device's UTC day (useUtcDay), which keys today's boards. */
  day: string;
  focusOnRecover: RefObject<HTMLElement | null>;
}): RanksBoards {
  const isToday = period === "today";
  const isFriends = scope === "friends";

  const global = useLeaderboard();
  const friends = useFriendsLeaderboard(!isToday && isFriends);
  const daily = useDailyLeaderboard(day, isToday);
  const friendsDaily = useFriendsDailyLeaderboard(day, isToday && isFriends);

  const globalRetry = useRetry(global.refreshLeaderboard, {
    failed: global.error,
    hasData: global.data !== null,
    focusOnRecover,
  });
  const friendsRetry = useRetry(friends.refreshFriendsLeaderboard, {
    failed: friends.error,
    hasData: friends.data !== null,
    focusOnRecover,
  });
  const dailyRetry = useRetry(daily.refreshDailyLeaderboard, {
    failed: daily.error,
    hasData: daily.data !== null,
    focusOnRecover,
  });
  const friendsDailyRetry = useRetry(friendsDaily.refreshFriendsDailyLeaderboard, {
    failed: friendsDaily.error,
    hasData: friendsDaily.data !== null,
    focusOnRecover,
  });

  const boards: Record<Period, Record<Scope, ActiveBoard>> = {
    alltime: {
      global: {
        refresh: global.refreshLeaderboard,
        retry: globalRetry,
        hasData: global.data !== null,
        climbers: global.data ?? [],
      },
      friends: {
        refresh: friends.refreshFriendsLeaderboard,
        retry: friendsRetry,
        hasData: friends.data !== null,
        climbers: friends.data?.climbers ?? [],
      },
    },
    today: {
      global: {
        refresh: daily.refreshDailyLeaderboard,
        retry: dailyRetry,
        hasData: daily.data !== null,
        climbers: daily.data?.climbers ?? [],
      },
      friends: {
        refresh: friendsDaily.refreshFriendsDailyLeaderboard,
        retry: friendsDailyRetry,
        hasData: friendsDaily.data !== null,
        climbers: friendsDaily.data?.climbers ?? [],
      },
    },
  };

  return {
    active: boards[period][scope],
    todayMe: isToday ? (daily.data?.me ?? null) : null,
    friendsBoard: isToday ? friendsDaily.data : friends.data,
  };
}
