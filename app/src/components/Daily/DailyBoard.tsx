"use client";

/**
 * DailyBoard — the /daily/leaderboard standings: today's tower, best verified
 * height first. Same frame as /climb and /duel/leaderboard (BoardChrome), so
 * the Endless | Daily | 1v1 switch only swaps the words and the rows.
 *
 * The rows are server-rendered (topDailyClimbers) and passed in. This island
 * only adds the viewer's own standing, read from the existing
 * GET /api/climb/daily/leaderboard?day=… (its `me` field, computed outside the
 * shared cache). Every failure degrades to the CTA-only panel and never
 * touches the rows.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";
import { authedFetch } from "../../lib/authedFetch";
import { readSessionCache, writeSessionCache } from "../../lib/sessionCache";
import type { DailyClimberRank } from "../../db/dailyClimb";
import { ALTITUDE_UNIT } from "../../lib/units";
import {
  DAILY_HREF,
  DAILY_LEADERBOARD_HREF,
  LAUNCH_TRANSITION,
  SIGNIN_HREF,
} from "../navLinks";
import {
  BoardCta,
  BoardFindMe,
  BoardLayout,
  BoardNoMatch,
  BoardSearch,
  StandingPanel,
} from "../Leaderboard/BoardChrome";
import { ClimbLeaderboard, YOUR_ROW_ID } from "../Climb/ClimbLeaderboard";

/** The viewer's standing on the day: `me` from the daily board route. */
export interface DailyStandingView {
  /** Null when the viewer has opted out of leaderboards (height still shown). */
  rank: number | null;
  peakY: number;
  attempts: number;
}

type ViewerState =
  | { status: "anonymous" }
  | { status: "loading"; signedIn?: boolean }
  /** Signed in, no verified run on this day yet. */
  | { status: "none" }
  | { status: "ready"; standing: DailyStandingView; totalClimbers: number }
  | { status: "unavailable" };

/**
 * Narrow the route's JSON to the viewer's standing. `undefined` means the
 * body is not a board response at all (treated as a failed read); null means
 * a board response with no run for the viewer. Fields are checked, never
 * trusted (conventions.md: unchecked res.json() casts).
 */
export function parseDailyStanding(
  body: unknown
): { me: DailyStandingView | null; totalClimbers: number } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { me, totalClimbers } = body as { me?: unknown; totalClimbers?: unknown };
  if (typeof totalClimbers !== "number" || !Number.isFinite(totalClimbers)) return undefined;
  if (me === null) return { me: null, totalClimbers };
  if (typeof me !== "object") return undefined;
  const { rank, peakY, attempts } = me as { rank?: unknown; peakY?: unknown; attempts?: unknown };
  const rankOk = rank === null || (typeof rank === "number" && Number.isFinite(rank));
  if (
    !rankOk ||
    typeof peakY !== "number" ||
    !Number.isFinite(peakY) ||
    typeof attempts !== "number" ||
    !Number.isFinite(attempts)
  ) {
    return undefined;
  }
  return { me: { rank: rank as number | null, peakY, attempts }, totalClimbers };
}

const cacheKey = (day: string) => `daily-standing:${day}`;

function cachedStanding(uid: string, day: string): ViewerState {
  return readSessionCache<ViewerState>(uid, cacheKey(day)) ?? { status: "loading", signedIn: true };
}

function initialViewer(authLoading: boolean, uid: string | null, token: string | null, day: string): ViewerState {
  if (authLoading) return { status: "loading" };
  if (!uid || !token) return { status: "anonymous" };
  return cachedStanding(uid, day);
}

export function DailyBoard({
  day,
  climbers,
  unavailable = false,
}: {
  /** The UTC day these rows belong to (server clock). */
  day: string;
  climbers: DailyClimberRank[];
  unavailable?: boolean;
}) {
  const { user, token, loading: authLoading } = useAuth();
  const [viewer, setViewer] = useState<ViewerState>(() =>
    initialViewer(authLoading, user?.uid ?? null, token, day)
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      setViewer({ status: "anonymous" });
      return;
    }
    let cancelled = false;
    const uid = user.uid;
    setViewer(cachedStanding(uid, day));

    authedFetch(`/api/climb/daily/leaderboard?day=${encodeURIComponent(day)}`, token)
      .then(async (res) => (res.ok ? ((await res.json()) as unknown) : undefined))
      .then((body) => {
        if (cancelled) return;
        const parsed = parseDailyStanding(body);
        if (!parsed) {
          setViewer({ status: "unavailable" });
          return;
        }
        const next: ViewerState = parsed.me
          ? { status: "ready", standing: parsed.me, totalClimbers: parsed.totalClimbers }
          : { status: "none" };
        writeSessionCache(uid, cacheKey(day), next);
        setViewer(next);
      })
      .catch(() => {
        if (!cancelled) setViewer({ status: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [user, token, authLoading, day]);

  const viewerId = viewer.status === "ready" ? (user?.uid ?? null) : null;
  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (trimmed.length === 0) return climbers;
    const needle = trimmed.toLowerCase();
    return climbers.filter((c) => c.handle.toLowerCase().includes(needle));
  }, [climbers, trimmed]);

  const viewerInBoard = viewerId !== null && climbers.some((c) => c.userId === viewerId);
  const viewerVisible = viewerId !== null && filtered.some((c) => c.userId === viewerId);
  const noMatches = !unavailable && climbers.length > 0 && filtered.length === 0;

  return (
    <BoardLayout scope="daily" panel={<TodaysBestPanel viewer={viewer} />}>
      {!unavailable && climbers.length > 0 && (
        <BoardSearch id="daily-climber-search" label="Find a climber" value={query} onChange={setQuery}>
          {viewerInBoard && <BoardFindMe rowId={YOUR_ROW_ID} onClearSearch={() => setQuery("")} />}
        </BoardSearch>
      )}

      {noMatches ? (
        <BoardNoMatch query={trimmed} noun="climber" onClear={() => setQuery("")} />
      ) : (
        <ClimbLeaderboard
          climbers={filtered}
          unavailable={unavailable}
          highlightUserId={viewerId}
          label="Today's Daily Climb leaderboard"
          emptyText="Nobody has climbed today's tower yet. Be the first."
        />
      )}

      {viewer.status === "ready" && viewer.standing.rank !== null && !viewerVisible && !noMatches && (
        <PinnedRow rank={viewer.standing.rank} peakY={viewer.standing.peakY} />
      )}
    </BoardLayout>
  );
}

const DAILY_STATS = [
  { label: "Today's rank", tone: "signal" },
  { label: "Climbers", tone: "secondary" },
] as const;

function TodaysBestPanel({ viewer }: { viewer: ViewerState }) {
  const ready = viewer.status === "ready" ? viewer : null;
  const signedIn =
    viewer.status !== "anonymous" && !(viewer.status === "loading" && viewer.signedIn !== true);

  return (
    <StandingPanel
      label="Your climb today"
      signedIn={signedIn}
      pending={viewer.status === "loading" && viewer.signedIn === true}
      unit={ALTITUDE_UNIT}
      stats={DAILY_STATS}
      record={
        ready
          ? {
              value: ready.standing.peakY.toFixed(0),
              // A viewer who opted out of leaderboards has a height but no rank.
              stats: [ready.standing.rank === null ? "Hidden" : `#${ready.standing.rank}`, ready.totalClimbers],
            }
          : null
      }
      message={
        viewer.status === "loading" ? (
          "Checking your standing…"
        ) : viewer.status === "anonymous" ? (
          <>
            <Link
              href={`${SIGNIN_HREF}?redirect=${encodeURIComponent(DAILY_LEADERBOARD_HREF)}`}
              className="text-signal underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to record today&rsquo;s height and take a rank.
          </>
        ) : viewer.status === "none" ? (
          "No climb on today’s tower yet. Your best height today is your rank."
        ) : (
          "Your standing couldn’t be loaded right now."
        )
      }
      cta={<BoardCta href={DAILY_HREF} transitionTypes={LAUNCH_TRANSITION}>Climb today&rsquo;s tower</BoardCta>}
    />
  );
}

/** The viewer's row, pinned below the board when it isn't in view above. */
function PinnedRow({ rank, peakY }: { rank: number; peakY: number }) {
  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        Your standing
      </p>
      <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-signal/50 bg-accent/6 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal font-mono text-sm font-bold tabular-nums text-void">
          {rank}
        </span>
        <span className="flex-1 truncate font-medium text-text-primary">You</span>
        <span className="font-mono font-bold tabular-nums text-signal">
          {peakY.toFixed(0)}
          <span className="font-normal text-text-secondary">{ALTITUDE_UNIT}</span>
        </span>
      </div>
    </div>
  );
}
