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

import { useEffect, useMemo, useState } from "react";
import { useClimb } from "../../game/useClimb";
import { TowerSpec } from "../../game/types";
import { ClimbCanvas } from "./ClimbCanvas";
import { TouchControls } from "./TouchControls";

export interface ClimbSceneProps {
  tower: TowerSpec;
  categoryLabel: string;
  /** Firebase ID token if signed in — enables record persistence. */
  idToken?: string | null;
}

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

export function ClimbScene({ tower, categoryLabel, idToken }: ClimbSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const seed = useMemo(() => `solo-${tower.categorySlug}`, [tower.categorySlug]);
  const { state, start, finished, setTouch } = useClimb({ tower, seed });
  const [posted, setPosted] = useState(false);

  const player = state.players[0];
  const phase = state.phase;

  // Persist the run result once, best-effort, when the run finishes (AC-30/31).
  useEffect(() => {
    if (!finished || posted) return;
    setPosted(true);
    const body = JSON.stringify({
      categorySlug: tower.categorySlug,
      peakY: player?.peakY ?? 0,
      finished: player?.status === "finished",
      finishedTick: player?.finishedTick ?? null,
      seed,
    });
    fetch("/api/climb/result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body,
    }).catch(() => {
      /* best-effort; never blocks the results screen */
    });
  }, [finished, posted, player, seed, tower.categorySlug, idToken]);

  const showControls = phase === "climb" || phase === "countdown";
  const onLadder = player?.onLadder ?? false;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <ClimbCanvas state={state} reducedMotion={reducedMotion} />

        {/* Countdown overlay. */}
        {phase === "countdown" && (
          <Overlay>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">
              Get ready
            </p>
            <p className="text-5xl font-bold text-text-primary font-mono mt-2">
              {Math.max(1, 3 - Math.floor(state.tick / 30))}
            </p>
          </Overlay>
        )}

        {/* Idle (pre-start) overlay. */}
        {phase === "lobby" && (
          <Overlay>
            <p className="text-xs uppercase tracking-[0.2em] text-accent">
              {categoryLabel} tower
            </p>
            <h2 className="text-2xl font-bold text-text-primary mt-1">
              Solo time-trial
            </h2>
            <p className="text-text-secondary text-sm mt-2 max-w-[240px] text-center">
              Climb to the flag before the lava catches you. First to the summit
              sets the record.
            </p>
            <StartButton onClick={start} label="Start climb" />
          </Overlay>
        )}

        {/* Results overlay. */}
        {finished && (
          <Overlay>
            {player?.status === "finished" ? (
              <>
                <p className="text-xs uppercase tracking-[0.2em] text-success">
                  Summit reached
                </p>
                <h2 className="text-3xl font-bold text-text-primary mt-1">
                  You made it
                </h2>
                <p className="text-text-secondary text-sm mt-2 font-mono">
                  time {(state.raceSeconds).toFixed(2)}s
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-[0.2em] text-danger">
                  Caught by the lava
                </p>
                <h2 className="text-3xl font-bold text-text-primary mt-1">
                  So close
                </h2>
              </>
            )}
            <p className="text-text-muted text-sm mt-3 font-mono">
              peak {(player?.peakY ?? 0).toFixed(1)}m
            </p>
            <StartButton onClick={start} label="Climb again" />
          </Overlay>
        )}
      </div>

      {showControls && (
        <div className="w-[360px] max-w-full">
          <TouchControls onChange={setTouch} showClimb={onLadder} />
        </div>
      )}

      {/* ARIA live region: announces win/eliminate for screen readers (NFR-5). */}
      <div className="sr-only" role="status" aria-live="polite">
        {finished
          ? player?.status === "finished"
            ? "You reached the summit."
            : "You were caught by the hazard."
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
      className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent text-void font-semibold px-6 min-h-[44px] hover:brightness-110 transition"
    >
      {label}
    </button>
  );
}
