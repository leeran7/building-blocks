"use client";

/**
 * Client wrapper for /daily — the Daily Climb.
 *
 * Locks the tower to today's shared seed so every player climbs the exact same
 * tower, and tracks a local streak + per-day best (commitDailyRun). The day is
 * the UTC day, and the seed comes only from GET /api/climb/daily: it is an
 * HMAC only the server can derive (SEC-DC-3). Without it the daily cannot
 * start, and the page offers a retry or an endless run. Signed-in runs post to
 * POST /api/climb/daily/result, which re-simulates the replay for the daily
 * board and raises the all-time record with the verified height.
 *
 * Composition: the stage only (same place and size as /play). The date,
 * next-tower countdown, the result once a run finishes, and the week streak
 * strip go to the tab band's "Today's tower" dialog (DailyToday.tsx). Share
 * and replay controls deliberately stay inside ClimbScene's result overlay
 * (shared with /play and replays) and are not duplicated here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ClimbScene } from "./ClimbScene";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { buildFreeTower } from "../../game/freeStack";
import Link from "next/link";
import { DAILY_INFO_PATH, isDailyInfoStale, parseDailyInfo, type DailyInfo } from "../../lib/dailyInfo";
import { DAILY_SIM_VERSION } from "../../game/simVersion";
import { usePublishDailyToday } from "./DailyToday";
import {
  dailySummary,
  dailyWeek,
  commitDailyRun,
  msUntilReset,
  formatReset,
  type DailyRunResult,
  type DailySummary,
  type DailyWeekDay,
} from "../../lib/daily";

const DAILY_RESULT_PATH = "/api/climb/daily/result";
/** Sent with every daily result so the server can reject a stale engine (SEC-DC-4). */
const DAILY_RESULT_FIELDS = { simVersion: DAILY_SIM_VERSION } as const;

/**
 * The server's live daily tower, or null when unreachable, unavailable or
 * malformed. Parsed by the same strict parser as the mobile app (RV-DC-5).
 */
async function fetchServerDaily(): Promise<DailyInfo | null> {
  try {
    const res = await fetch(DAILY_INFO_PATH, { cache: "no-store" });
    if (!res.ok) return null;
    return parseDailyInfo(await res.json());
  } catch {
    return null;
  }
}

export function DailyClimbClient({
  initialDaily = null,
  servedAt = 0,
}: {
  /**
   * Today's tower as the /daily server render saw it, so the stage paints on
   * the first frame instead of after a fetch. Still only from the server
   * (dailySeedFor), so SEC-DC-3 holds; a stale one (a cached page from before
   * the reset) is caught by the same check as a stale fetch.
   */
  initialDaily?: DailyInfo | null;
  /** Server clock (ms) when `initialDaily` was read: its "requested at". */
  servedAt?: number;
}) {
  const tower = buildFreeTower();
  const [daily, setDaily] = useState<DailyInfo | null>(initialDaily);
  const [dailyFailed, setDailyFailed] = useState(false);
  const [dailyAttempt, setDailyAttempt] = useState(0);
  // When the current answer was requested: it is stale once the server's
  // reset falls between that and a new start (RV-DC-3).
  const dailyRequestedAtRef = useRef(initialDaily ? servedAt : 0);
  const [refreshingDaily, setRefreshingDaily] = useState(false);
  const seed = daily?.seed ?? null;
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [week, setWeek] = useState<DailyWeekDay[]>([]);
  const [today, setToday] = useState<string>("");
  const [reset, setReset] = useState<string>("");
  const [result, setResult] = useState<DailyRunResult | null>(null);

  // localStorage + the clock are client-only — resolve after mount
  // so SSR and the first client render agree (no hydration mismatch). Refresh
  // the reset countdown each minute so it doesn't go stale in a long lobby.
  const hadInitialDaily = initialDaily !== null;
  useEffect(() => {
    // The server already answered for this render; later attempts (retry,
    // a refetch after the reset) always ask again.
    if (dailyAttempt === 0 && hadInitialDaily) return;
    let cancelled = false;
    const requestedAt = Date.now();
    setDailyFailed(false);
    void fetchServerDaily().then((next) => {
      if (cancelled) return;
      setRefreshingDaily(false);
      if (next) {
        dailyRequestedAtRef.current = requestedAt;
        setDaily(next);
      } else {
        // A closed tower is never played: without today's answer the page
        // falls back to the offline state (only reachable between runs).
        setDaily(null);
        setDailyFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dailyAttempt, hadInitialDaily]);

  useEffect(() => {
    setSummary(dailySummary());
    setWeek(dailyWeek());
    setToday(formatToday(new Date()));
    setReset(formatReset(msUntilReset()));
    const id = setInterval(() => setReset(formatReset(msUntilReset())), 60_000);
    return () => clearInterval(id);
  }, []);

  // A new day's tower replaces yesterday's result panel and re-reads the
  // streak, date and countdown for the new day.
  const shownDayRef = useRef<string | null>(null);
  const liveDay = daily?.day ?? null;
  useEffect(() => {
    if (liveDay === null) return;
    const previous = shownDayRef.current;
    shownDayRef.current = liveDay;
    if (previous === null || previous === liveDay) return;
    setResult(null);
    setSummary(dailySummary());
    setWeek(dailyWeek());
    setToday(formatToday(new Date()));
    setReset(formatReset(msUntilReset()));
  }, [liveDay]);

  const handleFinish = useCallback((peakY: number) => {
    // The seed is opaque, so the day comes from the answer that supplied it.
    const run = commitDailyRun(peakY, daily?.day);
    setResult(run);
    // The run just changed both — re-read rather than patching two copies.
    setSummary(dailySummary());
    setWeek(dailyWeek());
  }, [daily]);

  // Before every start: if 00:00 UTC passed since this seed was fetched, the
  // tower is closed. Refetch instead of starting; the button waits meanwhile.
  const beforeStart = useCallback((): boolean => {
    if (!daily) return false;
    if (!isDailyInfoStale(daily, dailyRequestedAtRef.current, Date.now())) return true;
    setRefreshingDaily(true);
    setDailyAttempt((n) => n + 1);
    return false;
  }, [daily]);

  const streak = result?.streak ?? summary?.streak ?? 0;

  if (!seed) {
    return (
      <DailyShell today={today} reset={reset} streak={streak} week={week} result={null}>
        <StagePlaceholder>
          {dailyFailed ? (
            <DailyOffline onRetry={() => setDailyAttempt((n) => n + 1)} />
          ) : (
            <p role="status" className="text-text-muted text-sm text-center font-mono">
              Loading today&rsquo;s climb…
            </p>
          )}
        </StagePlaceholder>
      </DailyShell>
    );
  }

  return (
    <DailyShell today={today} reset={reset} streak={streak} week={week} result={result}>
      <ClimbScene
        tower={tower}
        categoryLabel="Daily"
        seed={seed}
        resultPath={DAILY_RESULT_PATH}
        resultFields={DAILY_RESULT_FIELDS}
        shareAfterSave
        onFinish={handleFinish}
        onBeforeStart={beforeStart}
        startBlockedLabel={refreshingDaily ? "Loading today\u2019s tower\u2026" : null}
        lobbyExtra={
          <>
            <h2 className="font-display text-4xl text-text-primary mt-2">
              Daily Climb
            </h2>
            <p className="text-text-secondary text-sm mt-3 max-w-[280px] text-center leading-relaxed">
              Everyone climbs the same tower today. One seed, one shot at the top
              of the daily board — come back tomorrow to keep your streak alive.
            </p>
            {streak > 0 ? (
              <p className="mt-3 flex w-fit items-center gap-2 rounded-full border border-ember/40 bg-ember/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
                <span className="text-sm">🔥</span>
                {streak}-day streak
              </p>
            ) : null}
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Resets in {reset}
            </p>
          </>
        }
        resultExtra={
          result ? (
            <p className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-ember/40 bg-ember/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              <span className="text-sm">🔥</span>
              {result.streakExtended
                ? `${result.streak}-day streak`
                : `Daily streak ${result.streak}`}
              {result.isDayBest ? (
                <span className="text-signal">· today&rsquo;s best</span>
              ) : null}
            </p>
          ) : null
        }
      />
    </DailyShell>
  );
}

// ────────────────────────────── Presentational ─────────────────────────────

/**
 * Holds the stage's place until today's seed arrives: the same box ClimbScene
 * will draw (measured by the same hook, from the same spot), so the page
 * doesn't jump up and then get shoved down when the tower lands. On touch it takes the screen like the stage does.
 */
function StagePlaceholder({ children }: { children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const touchDevice = useCoarsePointer();
  const size = useCanvasSize(boxRef, { fill: touchDevice });
  return (
    <div
      className={
        touchDevice
          ? "fixed inset-0 z-40 flex items-center justify-center bg-void px-4"
          : "flex w-full flex-col items-center"
      }
    >
      <div
        ref={boxRef}
        data-testid="daily-stage-placeholder"
        className={
          touchDevice
            ? "flex flex-col items-center"
            : "flex items-center justify-center rounded-xl border border-border-subtle bg-surface/40 px-4"
        }
        style={touchDevice ? undefined : { width: size.width, height: size.height }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Today's seed comes only from the server, so with no connection the daily
 * cannot start. Offer a retry, or an endless run on a random tower.
 */
function DailyOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
      <p className="text-sm text-text-secondary">
        Can&rsquo;t load today&rsquo;s tower. Check your connection and try again.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-signal px-6 text-sm font-semibold text-void transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Try again
        </button>
        <Link
          href="/play"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border-strong bg-surface/60 px-6 text-sm font-medium text-text-primary transition-colors hover:border-signal/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
        >
          Play endless instead
        </Link>
      </div>
    </div>
  );
}

/**
 * The stage only. The date, countdown, streak and result are published to the
 * page's DailyTodayProvider and shown from the tab band's "Today's tower"
 * button (DailyToday.tsx), so nothing under the stage moves between runs and
 * Play ↔ Daily switch between two pages of the same shape.
 */
function DailyShell({
  today,
  reset,
  streak,
  week,
  result,
  children,
}: {
  today: string;
  reset: string;
  streak: number;
  week: DailyWeekDay[];
  result: DailyRunResult | null;
  children: React.ReactNode;
}) {
  usePublishDailyToday({ today, reset, streak, week, result });
  return <div className="flex flex-col items-center">{children}</div>;
}

// ──────────────────────────────── Helpers ──────────────────────────────────

/** "September 20" in the viewer's locale — client-only (local calendar day). */
function formatToday(now: Date): string {
  try {
    return now.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  } catch {
    return "";
  }
}
