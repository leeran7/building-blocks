"use client";

/**
 * Tower v3 "The Climb" — solo climb scene (Phase 1 MVP).
 *
 * Composes the deterministic climb (useClimb) with the canvas renderer, touch
 * controls, and the match lifecycle UI: idle → countdown → climb → results.
 * Win = touching the summit flag (spec-next.md). Reduced-motion is honored for
 * rendering; the simulation is identical either way (AC-35).
 *
 * On finish, POSTs the run result (peak height + finish) so a signed-in user's
 * permanent peak-height record can be updated (AC-30/AC-31). Anonymous players
 * can play but their record is not saved — the POST is best-effort and failures
 * never block the results screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useClimb } from "../../game/useClimb";
import { TowerSpec } from "../../game/types";
import { ClimbCanvas } from "./ClimbCanvas";
import { useAuth } from "../../contexts/AuthContext";
import { climberHandle } from "../../lib/handle";

export interface ClimbSceneProps {
  tower: TowerSpec;
  categoryLabel: string;
}

interface SaveInfo {
  saved: boolean;
  improved?: boolean;
  rank?: number;
  totalClimbers?: number;
  /** Name to show for the climber (profile name, else pseudonym). */
  handle?: string;
}

// A finished run stashed here survives the navigation to sign-in and back, so a
// signed-out player's record can be saved once they authenticate.
const PENDING_CLIMB_KEY = "doomstack:pending-climb";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export function ClimbScene({ tower, categoryLabel }: ClimbSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const seed = useMemo(() => `solo-${tower.categorySlug}`, [tower.categorySlug]);
  const { state, start, finished } = useClimb({ tower, seed });
  const { user, token } = useAuth();
  const [posted, setPosted] = useState(false);
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);
  // Confirmation shown after a run saved via the sign-in → return flow.
  const [savedBanner, setSavedBanner] = useState<SaveInfo | null>(null);

  const player = state.players[0];
  const phase = state.phase;

  // sessionStorage key for a run awaiting sign-in, + where to return after login.
  const redirectPath = `/play/${tower.categorySlug}`;

  const buildRun = useCallback(
    () => ({
      categorySlug: tower.categorySlug,
      peakY: player?.peakY ?? 0,
      finished: player?.status === "finished",
      finishedTick: player?.finishedTick ?? null,
      seed,
    }),
    [player, seed, tower.categorySlug]
  );

  const postRun = useCallback(
    async (run: object, authToken: string): Promise<SaveInfo> => {
      const res = await fetch("/api/climb/result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(run),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      return res
        ? {
            saved: Boolean(res.saved),
            improved: Boolean(res.improved),
            rank: typeof res.rank === "number" ? res.rank : undefined,
            totalClimbers:
              typeof res.totalClimbers === "number" ? res.totalClimbers : undefined,
            handle: typeof res.handle === "string" ? res.handle : undefined,
          }
        : { saved: false };
    },
    []
  );

  // Start / restart: reset the save guard so EVERY run is recorded (not just
  // the first), then kick off the countdown.
  function handleStart() {
    setPosted(false);
    setSaveInfo(null);
    setSavedBanner(null);
    start();
  }

  // Persist the run once per run when it finishes. Signed-in → save now. Signed
  // out → stash the run in sessionStorage so it can be saved after the player
  // signs in and is redirected back here (AC-30/31).
  useEffect(() => {
    if (!finished || posted) return;
    setPosted(true);
    const run = buildRun();
    if (token) {
      postRun(run, token).then(setSaveInfo);
    } else {
      setSaveInfo({ saved: false });
      try {
        sessionStorage.setItem(PENDING_CLIMB_KEY, JSON.stringify(run));
      } catch {
        /* storage unavailable — sign-in save just won't persist */
      }
    }
  }, [finished, posted, buildRun, token, postRun]);

  // On mount / when auth resolves: if a pending run for THIS category is waiting
  // (from the sign-in flow), save it now and confirm it.
  useEffect(() => {
    // Only a real (non-anonymous) account can save; don't let a guest login
    // consume and lose the pending run.
    if (!user || !token || user.isAnonymous) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_CLIMB_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let run: { categorySlug?: string } | null = null;
    try {
      run = JSON.parse(raw);
    } catch {
      run = null;
    }
    if (!run || run.categorySlug !== tower.categorySlug) return;
    try {
      sessionStorage.removeItem(PENDING_CLIMB_KEY);
    } catch {
      /* ignore */
    }
    postRun(run, token).then(setSavedBanner);
  }, [user, token, tower.categorySlug, postRun]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Saved confirmation — after signing in from a finished run and returning. */}
      {savedBanner?.saved && (
        <div
          className="w-full rounded-xl border border-signal/40 bg-signal/[0.06] px-4 py-2.5 text-center"
          role="status"
        >
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-signal">
            ✓ Record saved
            {savedBanner.rank ? (
              <>
                {" · "}#{savedBanner.rank}
                {savedBanner.totalClimbers ? ` of ${savedBanner.totalClimbers}` : ""}
              </>
            ) : null}
          </p>
        </div>
      )}

      <div className="relative">
        <ClimbCanvas state={state} reducedMotion={reducedMotion} />

        {/* Countdown overlay. */}
        {phase === "countdown" && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ get ready ]
            </p>
            <p className="font-display text-7xl text-text-primary mt-3 tabular-nums">
              {Math.max(1, 3 - Math.floor(state.tick / 30))}
            </p>
          </Overlay>
        )}

        {/* Idle (pre-start) overlay. */}
        {phase === "lobby" && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ {categoryLabel} climb ]
            </p>
            <h2 className="font-display text-4xl text-text-primary mt-2">
              Endless climb
            </h2>
            <p className="text-text-secondary text-sm mt-3 max-w-[260px] text-center leading-relaxed">
              Climb as high as you can before the rising lava catches you. It gets
              harder the higher you go — your peak height is your score.
            </p>
            <StartButton onClick={handleStart} label="Start climb" />
          </Overlay>
        )}

        {/* Results overlay — endless climb ends when the lava catches you. */}
        {finished && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              ▲ caught by the lava
            </p>
            <h2 className="font-mono text-6xl font-bold text-signal tabular-nums mt-2 leading-none">
              {(player?.peakY ?? 0).toFixed(0)}
              <span className="text-2xl text-text-muted font-normal ml-1">m</span>
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mt-2">
              your highest climb
            </p>

            {/* Record status + leaderboard place (immediate). */}
            {user ? (
              saveInfo?.saved && saveInfo.rank ? (
                <div className="mt-3 flex flex-col items-center gap-0.5">
                  <p className="text-lg font-bold text-accent">
                    #{saveInfo.rank}
                    {saveInfo.totalClimbers ? (
                      <span className="text-text-muted font-normal text-sm">
                        {" "}
                        of {saveInfo.totalClimbers}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-muted">
                    {saveInfo.improved ? "new personal best · " : ""}
                    {saveInfo.handle ?? climberHandle(user.uid)}
                  </p>
                </div>
              ) : (
                <p className="text-xs mt-3 font-mono text-text-muted">
                  {saveInfo === null ? "Saving…" : "Couldn’t save your run"}
                </p>
              )
            ) : (
              <p className="text-xs mt-3 text-text-muted">
                <Link
                  href={`/auth/signin?redirect=${encodeURIComponent(redirectPath)}`}
                  onClick={() => {
                    try {
                      sessionStorage.setItem(
                        PENDING_CLIMB_KEY,
                        JSON.stringify(buildRun())
                      );
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="text-accent underline underline-offset-2"
                >
                  Sign in
                </Link>{" "}
                to save your record & rank
              </p>
            )}

            <StartButton onClick={handleStart} label="Climb again" />
            <Link
              href={`/climb/${tower.categorySlug}`}
              className="mt-3 text-sm text-accent hover:brightness-110 underline underline-offset-4"
            >
              View leaderboard →
            </Link>
          </Overlay>
        )}
      </div>

      {/* ARIA live region: announces win/eliminate for screen readers (NFR-5). */}
      <div className="sr-only" role="status" aria-live="polite">
        {finished
          ? `You were caught by the lava at ${(player?.peakY ?? 0).toFixed(
              0
            )} metres.`
          : ""}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-void/70 backdrop-blur-sm p-4 text-center">
      {children}
    </div>
  );
}

function StartButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 inline-flex items-center justify-center rounded-full bg-signal text-void font-semibold px-7 min-h-[48px] shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
    >
      {label}
    </button>
  );
}
