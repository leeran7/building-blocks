"use client";

/**
 * Client wrapper for /daily — the Daily Climb.
 *
 * Locks the tower to today's shared seed (dailySeed) so every player climbs the
 * exact same tower, and tracks a local streak + per-day best (commitDailyRun).
 * Runs still post to the global /climb leaderboard through ClimbScene's normal
 * save path — the server just sees the daily seed.
 *
 * Composition (mockup 3): a header strip (date · title · next-tower countdown)
 * above the stage, then — once a run finishes — a result panel with the height
 * readout, then the week streak strip. Share and replay controls deliberately
 * stay inside ClimbScene's result overlay (shared with /play and replays) and
 * are not duplicated here.
 */

import { useCallback, useEffect, useState } from "react";
import { ClimbScene } from "./ClimbScene";
import { ClimbControlsGuide } from "./ClimbControlsGuide";
import { buildFreeTower } from "../../game/freeStack";
import { ALTITUDE_UNIT } from "../../lib/units";
import {
  dailySeed,
  dailySummary,
  dailyWeek,
  commitDailyRun,
  msUntilReset,
  formatReset,
  type DailyRunResult,
  type DailySummary,
  type DailyWeekDay,
} from "../../lib/daily";

export function DailyClimbClient() {
  const tower = buildFreeTower();
  const [seed, setSeed] = useState<string | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [week, setWeek] = useState<DailyWeekDay[]>([]);
  const [today, setToday] = useState<string>("");
  const [reset, setReset] = useState<string>("");
  const [result, setResult] = useState<DailyRunResult | null>(null);

  // localStorage + the local calendar day are client-only — resolve after mount
  // so SSR and the first client render agree (no hydration mismatch). Refresh
  // the reset countdown each minute so it doesn't go stale in a long lobby.
  useEffect(() => {
    setSeed(dailySeed());
    setSummary(dailySummary());
    setWeek(dailyWeek());
    setToday(formatToday(new Date()));
    setReset(formatReset(msUntilReset()));
    const id = setInterval(() => setReset(formatReset(msUntilReset())), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleFinish = useCallback((peakY: number) => {
    const run = commitDailyRun(peakY);
    setResult(run);
    // The run just changed both — re-read rather than patching two copies.
    setSummary(dailySummary());
    setWeek(dailyWeek());
  }, []);

  const streak = result?.streak ?? summary?.streak ?? 0;

  if (!seed) {
    return (
      <DailyShell today={today} reset={reset} streak={streak} week={week} result={null}>
        <p className="text-text-muted text-sm text-center font-mono">
          Loading today&rsquo;s climb…
        </p>
      </DailyShell>
    );
  }

  return (
    <DailyShell today={today} reset={reset} streak={streak} week={week} result={result}>
      <ClimbScene
        tower={tower}
        categoryLabel="Daily"
        seed={seed}
        onFinish={handleFinish}
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
  return (
    <div className="flex flex-col items-center gap-5">
      <DailyHeader today={today} reset={reset} />

      {children}

      <div className="flex w-full max-w-4xl flex-col gap-3">
        {result ? <DailyResult result={result} /> : null}

        <StreakStrip streak={streak} week={week} justClimbed={result !== null} />
      </div>

      <div className="w-full max-w-lg">
        <ClimbControlsGuide collapsible />
      </div>
    </div>
  );
}

/** Date · title · next-tower countdown, above the stage. */
function DailyHeader({ today, reset }: { today: string; reset: string }) {
  return (
    <header className="flex w-full max-w-4xl flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
          {today ? `${today} · daily climb` : "daily climb"}
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-text-primary mt-1">
          Today&rsquo;s tower
        </h2>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface px-4 py-2 text-right">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          Next tower in
        </p>
        <p className="font-mono text-lg font-bold tabular-nums text-text-primary">
          {reset || "—"}
        </p>
      </div>
    </header>
  );
}

/** Post-run readout. No share / replay controls — the overlay already owns those. */
function DailyResult({ result }: { result: DailyRunResult }) {
  return (
    <section
      aria-label="Today's result"
      data-climb-chrome
      className="climb-reveal relative overflow-hidden rounded-2xl border border-signal/30 bg-surface p-6 shadow-signal"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" aria-hidden="true" />

      <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
        ✓ today complete
      </p>
      <h3 className="relative font-display text-3xl md:text-4xl font-bold tracking-tight text-text-primary mt-2">
        You climbed today&rsquo;s tower.
      </h3>

      <div className="relative mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            Your height today
          </p>
          <p className="font-mono text-5xl font-bold tabular-nums leading-none text-text-primary mt-1">
            {result.todayBest.toFixed(0)}
            <span className="ml-1 text-xl font-normal text-text-secondary">
              {ALTITUDE_UNIT}
            </span>
          </p>
        </div>
        {result.isDayBest && (
          <p className="rounded-full border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
            today&rsquo;s best
          </p>
        )}
      </div>
    </section>
  );
}

/** The week's climbed days. Derived entirely from what's already stored. */
function StreakStrip({
  streak,
  week,
  justClimbed,
}: {
  streak: number;
  week: DailyWeekDay[];
  justClimbed: boolean;
}) {
  if (week.length === 0) return null;

  return (
    <section
      aria-label="Your daily streak"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border-subtle bg-surface px-4 py-3"
    >
      <p className="font-display text-lg font-bold uppercase tracking-tight text-text-primary">
        {streak > 0 ? `${streak}-day streak` : "No streak yet"}
      </p>

      <ul className="flex gap-1.5">
        {week.map((day) => (
          <li key={day.key}>
            <span
              className={
                "flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-xs font-bold " +
                (day.played
                  ? "border-signal/50 bg-signal/10 text-signal"
                  : day.isToday
                    ? "border-signal/40 text-text-secondary"
                    : day.isFuture
                      ? "border-border-subtle text-text-muted opacity-50"
                      : "border-border-subtle text-text-muted")
              }
            >
              <span aria-hidden="true">{day.played ? "✓" : day.label}</span>
              <span className="sr-only">
                {day.weekday}
                {day.played
                  ? " — climbed"
                  : day.isFuture
                    ? " — not yet"
                    : " — missed"}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-text-muted sm:ml-auto">
        {justClimbed
          ? "Today's climb counted. Come back for the next tower."
          : "Climb today to keep the streak alive."}
      </p>
    </section>
  );
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
