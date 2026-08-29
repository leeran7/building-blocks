"use client";

/**
 * Tower v3 "The Climb" — solo climb scene (Phase 1 MVP).
 *
 * Composes the deterministic climb (useClimb) with the canvas renderer, touch
 * controls, and the match lifecycle UI: idle → countdown → climb → results.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useClimb } from "../../game/useClimb";
import { TowerSpec } from "../../game/types";
import { ClimbCanvas } from "./ClimbCanvas";
import { ClimbControlsGuide } from "./ClimbControlsGuide";
import { PowerUpHud } from "./PowerUpHud";
import { usePowerUpFeedback } from "./usePowerUpFeedback";
import { TouchControls, TOUCH_CONTROLS_INSET } from "./TouchControls";
import { useAuth } from "../../contexts/AuthContext";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { climberHandle } from "../../lib/handle";

export interface ClimbSceneProps {
  tower: TowerSpec;
  categoryLabel: string;
  /** Overlay control on the HUD (leaderboard link, close, etc.). */
  leading?: ReactNode;
}

interface SaveInfo {
  saved: boolean;
  improved?: boolean;
  rank?: number;
  totalClimbers?: number;
  handle?: string;
}

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

export function ClimbScene({ tower, categoryLabel, leading }: ClimbSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const touchDevice = useCoarsePointer();
  const seed = useMemo(() => `solo-${tower.categorySlug}`, [tower.categorySlug]);
  const { state, start, finished, setTouch } = useClimb({ tower, seed });
  // Fills the parent: the play page and game overlay are viewport-sized, and
  // overlays (HUD, touch controls) sit on the canvas rather than stealing height.
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef);
  const { user, token } = useAuth();
  const [posted, setPosted] = useState(false);
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);
  const [savedBanner, setSavedBanner] = useState<SaveInfo | null>(null);

  const player = state.players[0];
  const phase = state.phase;
  const touchControlsActive =
    touchDevice && !finished && (phase === "countdown" || phase === "climb");
  const { muted, setMuted, announcement } = usePowerUpFeedback(player, state.tick);

  const redirectPath = `/play`;

  const buildRun = useCallback(
    () => ({
      peakY: player?.peakY ?? 0,
      finished: player?.status === "finished",
      finishedTick: player?.finishedTick ?? null,
      seed,
    }),
    [player, seed]
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

  function handleStart() {
    setPosted(false);
    setSaveInfo(null);
    setSavedBanner(null);
    start();
  }

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
        /* storage unavailable */
      }
    }
  }, [finished, posted, buildRun, token, postRun]);

  useEffect(() => {
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
    if (!run) return;
    try {
      sessionStorage.removeItem(PENDING_CLIMB_KEY);
    } catch {
      /* ignore */
    }
    postRun(run, token).then(setSavedBanner);
  }, [user, token, postRun]);

  useEffect(() => {
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div ref={canvasBoxRef} className="absolute inset-0">
        <ClimbCanvas
          state={state}
          reducedMotion={reducedMotion}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={touchDevice ? TOUCH_CONTROLS_INSET : 0}
        />

        {savedBanner?.saved && (
          <div
            className="absolute inset-x-0 top-12 z-20 mx-auto w-max max-w-[calc(100%-1.5rem)] rounded-xl border border-signal/40 bg-void/90 px-4 py-2.5 text-center"
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

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-void/80 to-transparent pt-[max(0.25rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto">
            <PowerUpHud
              player={player}
              tick={state.tick}
              hazardY={state.hazardY}
              muted={muted}
              onToggleMute={() => setMuted(!muted)}
              announcement={announcement}
              leading={leading}
            />
          </div>
        </div>

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

        {phase === "lobby" && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ {categoryLabel} climb ]
            </p>
            <h2 className="font-display text-4xl text-text-primary mt-2">
              Endless climb
            </h2>
            <p className="text-text-secondary text-sm mt-3 max-w-[280px] text-center leading-relaxed">
              Climb as high as you can before the rising lava catches you. It gets
              harder the higher you go — your peak height is your score. Grab
              glowing orbs to trigger their power-ups instantly.
            </p>
            <ClimbControlsGuide variant="overlay" />
            <StartButton onClick={handleStart} label="Start climb" />
          </Overlay>
        )}

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
              href="/climb"
              className="mt-3 text-sm text-accent hover:brightness-110 underline underline-offset-4"
            >
              View leaderboard →
            </Link>
          </Overlay>
        )}

        {touchDevice && (
          <TouchControls active={touchControlsActive} onInput={setTouch} />
        )}
      </div>

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

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-void/70 backdrop-blur-sm p-4 text-center">
      {children}
    </div>
  );
}

function StartButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 inline-flex items-center justify-center rounded-full bg-signal text-void font-semibold px-10 min-h-[60px] text-lg shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
    >
      {label}
    </button>
  );
}
