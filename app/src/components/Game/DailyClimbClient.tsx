"use client";

/**
 * Client wrapper for /daily — the Daily Climb.
 *
 * Locks the tower to today's shared seed (dailySeed) so every player climbs the
 * exact same tower, and tracks a local streak + per-day best (commitDailyRun).
 * Runs still post to the global /climb leaderboard through ClimbScene's normal
 * save path — the server just sees the daily seed.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClimbScene } from "./ClimbScene";
import { ClimbControlsGuide } from "./ClimbControlsGuide";
import { buildFreeTower } from "../../game/freeStack";
import {
  dailySeed,
  dailySummary,
  commitDailyRun,
  msUntilReset,
  formatReset,
  type DailyRunResult,
  type DailySummary,
} from "../../lib/daily";

export function DailyClimbClient() {
  const tower = buildFreeTower();
  const [seed, setSeed] = useState<string | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [reset, setReset] = useState<string>("");
  const [result, setResult] = useState<DailyRunResult | null>(null);

  // localStorage + the local calendar day are client-only — resolve after mount
  // so SSR and the first client render agree (no hydration mismatch). Refresh
  // the reset countdown each minute so it doesn't go stale in a long lobby.
  useEffect(() => {
    setSeed(dailySeed());
    setSummary(dailySummary());
    setReset(formatReset(msUntilReset()));
    const id = setInterval(() => setReset(formatReset(msUntilReset())), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleFinish = useCallback((peakY: number) => {
    setResult(commitDailyRun(peakY));
  }, []);

  if (!seed) {
    return (
      <DailyShell>
        <p className="text-text-muted text-sm text-center font-mono">
          Loading today&rsquo;s climb…
        </p>
      </DailyShell>
    );
  }

  return (
    <DailyShell>
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
            {summary && summary.streak > 0 ? (
              <p className="mt-3 flex w-fit items-center gap-2 rounded-full border border-ember/40 bg-ember/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
                <span className="text-sm">🔥</span>
                {summary.streak}-day streak
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

function DailyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6">
      {children}
      <div className="w-full max-w-lg">
        <p className="text-text-secondary text-sm mb-4 text-center">
          The Daily Climb is the same tower for everyone today. Your peak height
          still ranks on the{" "}
          <Link href="/climb" className="text-accent underline underline-offset-2">
            free leaderboard
          </Link>
          .
        </p>
        <ClimbControlsGuide />
      </div>
    </div>
  );
}
