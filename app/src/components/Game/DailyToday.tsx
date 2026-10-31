"use client";

/**
 * DailyToday — the Daily Climb's "Today's tower" button in the stack tab band
 * and the dialog it opens: date, next-tower countdown, today's result once a
 * run finishes, the week streak strip, and whatever the page passes as
 * children (the Keep climbing links).
 *
 * DailyClimbClient owns the state (it reads the device's streak and the
 * clock after mount and updates them on a run or a rollover) and publishes it
 * through DailyTodayProvider, which /daily wraps around the whole stack shell
 * so the band and the stage share it. Before mount the button shows its label
 * with an empty countdown, at the same size, so the band doesn't shift.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ALTITUDE_UNIT } from "../../lib/units";
import type { DailyRunResult, DailyWeekDay } from "../../lib/daily";

export interface DailyTodayState {
  /** "October 31", client-only. */
  today: string;
  /** "3h 52m" until the next UTC reset, client-only. */
  reset: string;
  streak: number;
  week: DailyWeekDay[];
  result: DailyRunResult | null;
}

const EMPTY: DailyTodayState = { today: "", reset: "", streak: 0, week: [], result: null };

const StateCtx = createContext<DailyTodayState>(EMPTY);
const PublishCtx = createContext<((s: DailyTodayState) => void) | null>(null);

export function DailyTodayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DailyTodayState>(EMPTY);
  return (
    <PublishCtx.Provider value={setState}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </PublishCtx.Provider>
  );
}

/** DailyClimbClient's side: hand the latest state to the band. */
export function usePublishDailyToday({ today, reset, streak, week, result }: DailyTodayState) {
  const publish = useContext(PublishCtx);
  useEffect(() => {
    publish?.({ today, reset, streak, week, result });
  }, [publish, today, reset, streak, week, result]);
}

export function useDailyToday(): DailyTodayState {
  return useContext(StateCtx);
}

/**
 * The button's words: "Today's tower" and the countdown. The countdown slot
 * keeps a fixed width so the button doesn't resize when the clock arrives.
 */
export function DailyTodayLabel() {
  const { reset, streak } = useDailyToday();
  return (
    <span className="inline-flex items-center gap-2">
      <span>Today&rsquo;s tower</span>
      {streak > 0 ? (
        <span className="font-mono text-xs text-ember" aria-label={`${streak}-day streak`}>
          🔥{streak}
        </span>
      ) : null}
      <span
        className="inline-block min-w-[6ch] text-right font-mono text-xs tabular-nums text-text-muted"
        aria-label={reset ? `next tower in ${reset}` : undefined}
      >
        {reset}
      </span>
    </span>
  );
}

/** The dialog's body. */
export function DailyTodayPanel({ children }: { children?: ReactNode }) {
  const { today, reset, streak, week, result } = useDailyToday();
  return (
    <div className="flex flex-col gap-4">
      <DailyHeader today={today} reset={reset} />
      {result ? <DailyResult result={result} /> : null}
      <StreakStrip streak={streak} week={week} justClimbed={result !== null} />
      {children}
    </div>
  );
}

/** Date and next-tower countdown, at the top of the Today's tower dialog. */
function DailyHeader({ today, reset }: { today: string; reset: string }) {
  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
        {today ? `${today} · daily climb` : "daily climb"}
      </p>
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
      className="relative overflow-hidden rounded-2xl border border-signal/30 bg-surface p-6 shadow-signal"
    >
      <div className="pointer-events-none absolute inset-0 survey-grid opacity-40" aria-hidden="true" />

      <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
        ✓ today complete
      </p>
      <h3 className="relative font-display text-2xl font-bold tracking-tight text-text-primary mt-2">
        You climbed today&rsquo;s tower.
      </h3>

      <div className="relative mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            Your height today
          </p>
          <p className="font-mono text-4xl font-bold tabular-nums leading-none text-text-primary mt-1">
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
  // The week is read from this device after mount. Until then the strip keeps
  // its full size (seven empty days, text hidden) so nothing below it moves
  // when the days fill in.
  if (week.length === 0) {
    return (
      <section
        aria-hidden="true"
        className="invisible flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border-subtle bg-surface px-4 py-3"
      >
        <p className="font-display text-lg font-bold uppercase tracking-tight">No streak yet</p>
        <ul className="flex gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="h-9 w-9 rounded-lg border" />
          ))}
        </ul>
        <p className="text-xs sm:ml-auto">Climb today to keep the streak alive.</p>
      </section>
    );
  }

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
