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
import {
  TouchControls,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
} from "./TouchControls";
import { useAuth } from "../../contexts/AuthContext";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { useSafeAreaInsets } from "../../hooks/useSafeAreaInsets";
import { climberHandle } from "../../lib/handle";
import { ShareRun } from "./ShareRun";
import {
  buildReplayUrl,
  encodeRunReplay,
  type RunReplay,
} from "../../game/runReplay";

export interface ClimbSceneProps {
  tower: TowerSpec;
  categoryLabel: string;
  /** When set, the scene plays back a shared run instead of live controls. */
  replay?: RunReplay | null;
}

interface SaveInfo {
  saved: boolean;
  improved?: boolean;
  rank?: number;
  totalClimbers?: number;
  handle?: string;
}

const PENDING_CLIMB_KEY = "doomstack:pending-climb";

/**
 * Approx height (px) of the on-canvas height/lava HUD bar, so the overlaid
 * power-up strip on the full-bleed mobile stage sits just under it rather than
 * on top of it. Tracks the 34px bar in ClimbCanvas with a little breathing room;
 * exact alignment is not load-bearing.
 */
const MOBILE_HUD_BAR_PX = 40;

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

export function ClimbScene({ tower, categoryLabel, replay = null }: ClimbSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const touchDevice = useCoarsePointer();
  const { state, start, finished, setTouch, runId, inputLog, replaying } = useClimb({
    tower,
    seed: replay?.seed,
    replayInputs: replay?.inputs,
    autoStart: Boolean(replay),
  });
  // Measured on the canvas wrapper, not the scene root: the saved-record banner
  // renders between them, and budgeting from the root would ignore its height
  // and push the canvas (and the controls overlaid on it) past the fold.
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  // Touch devices get the full-bleed iOS stage: the canvas fills the viewport
  // and matches the device aspect. Desktop keeps the framed 9:16 column.
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: touchDevice });
  const safeArea = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [posted, setPosted] = useState(false);
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);
  const [savedBanner, setSavedBanner] = useState<SaveInfo | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [encodingShare, setEncodingShare] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  const player = state.players[0];
  const phase = state.phase;
  const touchControlsActive =
    touchDevice && !finished && (phase === "countdown" || phase === "climb");
  // Camera clearance under the touch controls = the buttons + their bottom gutter
  // (which grows into the home-indicator safe area). 0 on desktop (no controls).
  const bottomInset = touchDevice
    ? TOUCH_CONTROLS_INSET + Math.max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom)
    : 0;
  // Music plays through the countdown + climb and stops on the results screen.
  // Intensity ramps up over the last ~40m of clearance as the lava gains.
  // Not during a replay: a replay auto-starts with no user gesture, so kicking
  // the AudioContext there would trip the browser's autoplay block (a console
  // warning + a suspended context that only resumes on a later tap).
  const musicActive =
    !finished && !replaying && (phase === "countdown" || phase === "climb");
  const lavaGap = player ? player.y - state.hazardY : Infinity;
  const musicIntensity = Math.max(0, Math.min(1, (40 - lavaGap) / 40));
  const { muted, setMuted, announcement, unlockAudio } = usePowerUpFeedback(
    player,
    state.tick,
    runId,
    { active: musicActive, intensity: musicIntensity }
  );

  const redirectPath = `/play`;

  const buildRun = useCallback(
    () => ({
      peakY: player?.peakY ?? 0,
      finished: player?.status === "finished",
      finishedTick: player?.finishedTick ?? null,
      // Elapsed run length. finishedTick is only set when the lava catches the
      // player, so the server cannot rely on it to bound peakY.
      ticks: state.tick,
      seed: state.seed,
    }),
    [player, state.seed, state.tick]
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
    unlockAudio();
    setPosted(false);
    setSaveInfo(null);
    setSavedBanner(null);
    setShareUrl(null);
    setEncodingShare(false);
    setSavingRun(false);
    start();
  }

  useEffect(() => {
    if (!finished || posted || replaying) return;
    if (inputLog.length === 0) return;

    setPosted(true);
    const run = buildRun();

    const finishRun = async () => {
      setEncodingShare(true);
      setSavingRun(Boolean(token));
      const replayToken = await encodeRunReplay({
        seed: run.seed,
        peakY: run.peakY,
        inputs: inputLog,
      });
      if (replayToken) {
        setShareUrl(buildReplayUrl(replayToken, window.location.origin));
      }
      setEncodingShare(false);

      if (token) {
        const payload = replayToken ? { ...run, replayToken } : run;
        postRun(payload, token).then(setSaveInfo).finally(() => setSavingRun(false));
      } else {
        setSaveInfo({ saved: false });
        setSavingRun(false);
        try {
          sessionStorage.setItem(PENDING_CLIMB_KEY, JSON.stringify(run));
        } catch {
          /* storage unavailable */
        }
      }
    };

    finishRun();
  }, [finished, posted, replaying, inputLog, buildRun, token, postRun]);

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

  return (
    <div
      className={
        touchDevice
          ? "fixed inset-0 z-40 bg-void"
          : "flex flex-col items-center gap-4 w-full"
      }
    >
      {savedBanner?.saved && (
        <div
          className={
            touchDevice
              ? "absolute left-1/2 z-30 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl border border-signal/40 bg-signal/[0.06] px-4 py-2.5 text-center"
              : "w-full rounded-xl border border-signal/40 bg-signal/[0.06] px-4 py-2.5 text-center"
          }
          style={
            touchDevice
              ? { top: safeArea.top + MOBILE_HUD_BAR_PX + 8 }
              : undefined
          }
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

      {/* Power-up strip. Desktop: in-flow above the canvas (see the note in
          PowerUpHud on why it must not sit below it). Mobile: overlaid at the top
          of the full-bleed stage, tucked just under the safe area + HUD bar. */}
      <div
        className={
          touchDevice
            ? "pointer-events-none absolute inset-x-0 top-0 z-20"
            : undefined
        }
        style={
          touchDevice
            ? {
                paddingTop: safeArea.top + MOBILE_HUD_BAR_PX,
                paddingLeft: `max(8px, ${safeArea.left}px)`,
                paddingRight: `max(8px, ${safeArea.right}px)`,
              }
            : { width: canvasSize.width }
        }
      >
        <div className={touchDevice ? "pointer-events-auto" : undefined}>
          <PowerUpHud
            player={player}
            tick={state.tick}
            muted={muted}
            onToggleMute={() => setMuted(!muted)}
            announcement={announcement}
            runId={runId}
          />
        </div>
      </div>

      {/* Desktop: width tracks the canvas so overlays line up. Mobile: the box
          fills the whole full-bleed stage. */}
      <div
        ref={canvasBoxRef}
        data-climb-surface
        className={
          touchDevice ? "relative h-full w-full overflow-hidden" : "relative"
        }
        style={touchDevice ? undefined : { width: canvasSize.width }}
      >
        <ClimbCanvas
          state={state}
          reducedMotion={reducedMotion}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed={touchDevice}
          hudInsetTop={touchDevice ? safeArea.top : 0}
        />

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

        {phase === "lobby" && !replaying && (
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
            <Link
              href="/climb"
              className="mt-4 text-sm text-accent hover:brightness-110 underline underline-offset-4"
            >
              View leaderboard →
            </Link>
          </Overlay>
        )}

        {finished && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              {replaying ? "▲ replay finished" : "▲ caught by the lava"}
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
              ) : replaying ? null : (
                <p className="text-xs mt-3 font-mono text-text-muted">
                  {savingRun || saveInfo === null
                    ? "Saving…"
                    : "Couldn’t save your run"}
                </p>
              )
            ) : replaying ? null : (
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

            {!replaying ? (
              <ShareRun
                peakY={player?.peakY ?? 0}
                shareUrl={shareUrl}
                encoding={encodingShare}
              />
            ) : null}

            {!replaying ? (
              <StartButton onClick={handleStart} label="Climb again" />
            ) : null}
            {replaying ? (
              <Link
                href="/play"
                className="mt-3 text-sm text-accent hover:brightness-110 underline underline-offset-4"
              >
                Play yourself →
              </Link>
            ) : (
              <Link
                href="/climb"
                className="mt-3 text-sm text-accent hover:brightness-110 underline underline-offset-4"
              >
                View leaderboard →
              </Link>
            )}
          </Overlay>
        )}

        {replaying && phase !== "lobby" && phase !== "finished" && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-void/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            Watching replay
          </div>
        )}

        {touchDevice && !replaying && (
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
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-xl bg-void/70 backdrop-blur-sm p-4 text-center">
      <div className="my-auto flex w-full max-w-sm flex-col items-center py-2">
        {children}
      </div>
    </div>
  );
}

function StartButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-game-control
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      className="mt-6 inline-flex items-center justify-center rounded-full bg-signal text-void font-semibold px-10 min-h-[60px] text-lg shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
    >
      {label}
    </button>
  );
}
