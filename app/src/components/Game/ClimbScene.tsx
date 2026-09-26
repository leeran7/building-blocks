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
import {
  isInteractiveTarget,
  useClimb,
} from "../../game/useClimb";
import { TowerSpec } from "../../game/types";
import { ClimbCanvas } from "./ClimbCanvas";
import { ClimbControlsGuide } from "./ClimbControlsGuide";
import { ExpeditionHud } from "./ExpeditionHud";
import { usePowerUpFeedback } from "./usePowerUpFeedback";
import {
  CAMERA_AIR_BAND_FRAC,
  cameraTargetY,
  type ClimbCameraBag,
  climbView,
  heldFocusY,
  isLavaThreatening,
  lavaThreatFill,
} from "./climbCamera";
import { hazardPhase } from "../../game/hazard";
import {
  TouchControls,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
} from "./TouchControls";
import { useAuth } from "../../contexts/AuthContext";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { useSafeAreaInsets } from "../../hooks/useSafeAreaInsets";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFullscreen } from "../../hooks/useFullscreen";

import { climberHandle } from "../../lib/handle";
import { climbEyebrowLabel } from "../../lib/climbEyebrow";
import { ALTITUDE_UNIT, formatAltitudeLabel } from "../../lib/units";
import { ShareRun } from "./ShareRun";
import {
  buildReplayUrl,
  encodeRunReplay,
  type RunReplay,
} from "../../game/runReplay";
import { shouldCaptureReplayKey } from "../../game/replayTransport";
import { ReplayTransportBar } from "./ReplayTransportBar";
import { useReplayExport } from "./useReplayExport";
import { useRouter } from "next/navigation";

export interface ClimbSceneProps {
  tower: TowerSpec;
  categoryLabel: string;
  /** When set, the scene plays back a shared run instead of live controls. */
  replay?: RunReplay | null;
  /**
   * Locks the tower to a deterministic seed (e.g. Daily Climb's per-day seed).
   * Ignored during replay, which carries its own seed.
   */
  seed?: string;
  /** Fired once when a live run finishes (not during replay). For Daily Climb. */
  onFinish?: (peakY: number) => void;
  /** Extra content rendered in the lobby overlay (e.g. daily streak card). */
  lobbyExtra?: ReactNode;
  /** Extra content rendered in the results overlay (e.g. daily streak result). */
  resultExtra?: ReactNode;
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

export function ClimbScene({
  tower,
  categoryLabel,
  replay = null,
  seed,
  onFinish,
  lobbyExtra,
  resultExtra,
}: ClimbSceneProps) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const touchDevice = useCoarsePointer();
  const {
    state,
    renderFeed,
    start,
    finished,
    setTouch,
    runId,
    inputLog,
    replaying,
    transport,
    togglePlayPause,
    cycleSpeed,
    rewind,
    seekToTick,
    restartReplay,
  } = useClimb({
    tower,
    // Replay carries its own seed; otherwise honor the optional daily seed lock.
    seed: replay?.seed ?? seed,
    replayInputs: replay?.inputs,
    autoStart: Boolean(replay),
  });
  const {
    status: exportStatus,
    startExport,
    cancelExport,
    dismissStatus,
  } = useReplayExport({
    replay,
    tower,
    enabled: replaying,
  });
  // Measured on the canvas wrapper, not the scene root: the saved-record banner
  // renders between them, and budgeting from the root would ignore its height
  // and push the canvas (and the controls overlaid on it) past the fold.
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  // Touch devices get the full-bleed iOS stage: the canvas fills the viewport
  // and matches the device aspect. Desktop keeps the framed 9:16 column.
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: touchDevice });
  const safeArea = useSafeAreaInsets();
  // Desktop full-screen stage (Fullscreen API). Touch already runs full-bleed.
  const sceneRef = useRef<HTMLDivElement>(null);
  const {
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen(sceneRef);
  const { user, token } = useAuth();
  const [posted, setPosted] = useState(false);
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);
  const [savedBanner, setSavedBanner] = useState<SaveInfo | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [encodingShare, setEncodingShare] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  // Guards onFinish so it fires exactly once per live run (reset on each start).
  const firedFinishRef = useRef(false);

  const player = state.players[0];
  const phase = state.phase;
  const touchControlsActive =
    touchDevice && !finished && (phase === "countdown" || phase === "climb");
  // Kill page scroll while a run is live so a stray wheel tick / Space / arrow
  // can't scroll the page out from under the stage. Touch runs the full-bleed
  // fixed stage (locked throughout); on desktop the lobby + results phases stay
  // unlocked so the how-to card and About copy below the canvas stay reachable.
  useBodyScrollLock(
    touchDevice || isFullscreen || phase === "countdown" || phase === "climb"
  );
  // Camera clearance under the touch controls = the buttons + their bottom gutter
  // (which grows into the home-indicator safe area). Replay never mounts those
  // buttons, so the inset is 0 — otherwise lava in that band is visible on the
  // canvas but ignored by audio. Live play keeps the inset after death so the
  // camera does not jump when the results overlay replaces the buttons.
  const bottomInset =
    touchDevice && !replaying
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
  // One camera for this scene, shared with the canvas. A stable mutable
  // object: the painter writes it every frame, this render only reads it.
  const [camera] = useState<ClimbCameraBag>(() => ({ y: null, tick: null }));
  const view = climbView(canvasSize.width, canvasSize.height, state.tower.widthM);
  // Frame the lava check on the same held focus the canvas painted, so the
  // "lava on screen" sting agrees with the screen through jumps and drops.
  const playerYNow = player?.y ?? 0;
  const camY = cameraTargetY(
    heldFocusY(camera.focusY, playerYNow, view.viewH * CAMERA_AIR_BAND_FRAC),
    view.viewH,
    bottomInset,
    view.pxPerMY
  );
  const lavaFill = lavaThreatFill(
    state.hazardY,
    camY,
    view.viewH,
    view.pxPerMY > 0 ? bottomInset / view.pxPerMY : 0
  );
  const lavaPhaseInfo = hazardPhase(state.raceSeconds - state.hazardSlowSeconds);

  // World one-shots call into the SFX engine; skip them on autoStart replay
  // the same way music is gated — there is no Start click to unlock Web Audio.
  const worldLive = !replaying;
  const { muted, setMuted, announcement, unlockAudio } = usePowerUpFeedback(
    player,
    state.tick,
    runId,
    { active: musicActive, intensity: musicIntensity },
    {
      jetpackThrusting: worldLive && (player?.jetpackThrusting ?? false),
      lavaOnScreen: worldLive && isLavaThreatening(lavaFill),
      lavaFill: worldLive ? lavaFill : 0,
      dead: worldLive && player?.status === "eliminated",
    }
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
    firedFinishRef.current = false;
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
      const payload = replayToken ? { ...run, replayToken } : run;

      if (token) {
        postRun(payload, token).then(setSaveInfo).finally(() => setSavingRun(false));
      } else {
        setSaveInfo({ saved: false });
        setSavingRun(false);
        try {
          // Stash the replayToken too — otherwise the retroactive save after
          // sign-in (below) persists this run with no replay link at all.
          sessionStorage.setItem(PENDING_CLIMB_KEY, JSON.stringify(payload));
        } catch {
          /* storage unavailable */
        }
      }
    };

    finishRun();
  }, [finished, posted, replaying, inputLog, buildRun, token, postRun]);

  // Fire onFinish once per live run (Daily Climb commits its streak here).
  const finishPeakY = player?.peakY ?? 0;
  useEffect(() => {
    if (!finished || replaying || firedFinishRef.current) return;
    if (inputLog.length === 0) return;
    firedFinishRef.current = true;
    onFinish?.(finishPeakY);
  }, [finished, replaying, inputLog, onFinish, finishPeakY]);

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

  // Replay transport shortcuts (AC-3). Separate from live jump capture.
  useEffect(() => {
    if (!replaying) return;
    const onKey = (e: KeyboardEvent) => {
      if (!shouldCaptureReplayKey(e.key, true, isInteractiveTarget(e.target))) {
        return;
      }
      e.preventDefault();
      if (e.key === " " || e.key === "Spacebar" || e.key === "k" || e.key === "K") {
        togglePlayPause();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        rewind();
        return;
      }
      if (e.key === "l" || e.key === "L" || e.key === ".") {
        cycleSpeed();
        return;
      }
      if (e.key === "Home" || e.key === "0") {
        seekToTick(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replaying, togglePlayPause, rewind, cycleSpeed, seekToTick]);

  const statusBadge =
    transport?.phaseLabel === "paused"
      ? "Paused"
      : transport?.phaseLabel === "finished"
        ? "Finished"
        : "Playing";

  return (
    <div
      ref={sceneRef}
      className={
        touchDevice
          ? "fixed inset-0 z-40 bg-void"
          : isFullscreen
            ? "flex h-screen w-screen flex-col items-center gap-4 overflow-hidden bg-void py-4"
            : "flex flex-col items-center gap-4 w-full"
      }
    >
      {savedBanner?.saved && (
        <div
          className={
            touchDevice
              ? "absolute left-1/2 z-30 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl border border-signal/40 bg-signal/6 px-4 py-2.5 text-center"
              : "w-full rounded-xl border border-signal/40 bg-signal/6 px-4 py-2.5 text-center"
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

      {/* Desktop: width tracks the canvas so overlays line up. Mobile: the box
          fills the whole full-bleed stage. */}
      <div
        ref={canvasBoxRef}
        data-climb-surface
        className={
          touchDevice ? "exp-stage relative h-full w-full overflow-hidden" : "exp-stage relative"
        }
        style={touchDevice ? undefined : { width: canvasSize.width }}
      >
        <ClimbCanvas
          state={state}
          feed={renderFeed}
          reducedMotion={reducedMotion}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed={touchDevice}
          hudInsetTop={touchDevice ? safeArea.top : 0}
          includeHud={false}
          floorMarkerInsetTop={(touchDevice ? safeArea.top : 0) + 80}
          camera={camera}
        />

        <ExpeditionHud
          player={player} hazardY={state.hazardY} tick={state.tick}
          lavaPhase={lavaPhaseInfo.phase} lavaPhaseProgress={lavaPhaseInfo.progress}
          muted={muted} onToggleMute={() => setMuted(!muted)}
          announcement={announcement} runId={runId}
          topInset={touchDevice ? safeArea.top : 0}
          leftInset={touchDevice ? safeArea.left : 0}
          rightInset={touchDevice ? safeArea.right : 0}
          fullscreenSupported={!touchDevice && fullscreenSupported}
          isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen}
          backControl={touchDevice && !replaying ? <button type="button" data-game-control className="exp-utility" aria-label="Back to home" title="Back to home" onClick={() => router.push("/")}>←</button> : undefined}
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
              [ {climbEyebrowLabel(categoryLabel)} ]
            </p>
            {lobbyExtra ?? (
              <>
                <h2 className="font-display text-4xl text-text-primary mt-2">
                  Endless climb
                </h2>
                <p className="text-text-secondary text-sm mt-3 max-w-[280px] text-center leading-relaxed">
                  Climb as high as you can before the rising lava catches you. It
                  gets harder the higher you go — your peak height is your score.
                  Grab glowing orbs to trigger their power-ups instantly.
                </p>
              </>
            )}
            <ClimbControlsGuide variant="overlay" />
            <StartButton onClick={handleStart} label="Start climb" />
          </Overlay>
        )}

        {finished && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              {replaying ? "▲ replay finished" : "▲ caught by the lava"}
            </p>
            <h2 className="font-mono text-6xl font-bold text-signal tabular-nums mt-2 leading-none">
              {(player?.peakY ?? 0).toFixed(0)}
              <span className="text-2xl text-text-muted font-normal ml-1">{ALTITUDE_UNIT}</span>
            </h2>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mt-2">
              your highest climb
            </p>

            {!replaying && resultExtra ? resultExtra : null}

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
            ) : (
              <div className="mt-6 flex flex-col items-center gap-2">
                <StartButton onClick={restartReplay} label="Restart" />
                <button
                  type="button"
                  data-game-control
                  onClick={() => {
                    void startExport();
                  }}
                  disabled={
                    exportStatus.kind === "running" ||
                    exportStatus.kind === "paused_hidden"
                  }
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border-strong bg-surface/60 px-8 font-semibold text-text-primary hover:border-signal/50 disabled:opacity-40"
                >
                  Export video
                </button>
              </div>
            )}
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

        {replaying && phase !== "lobby" && transport ? (
          <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-void/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            {statusBadge}
          </div>
        ) : null}

        {replaying && phase !== "lobby" && transport ? (
          <ReplayTransportBar
            transport={transport}
            finished={finished}
            onTogglePlayPause={togglePlayPause}
            onRewind={rewind}
            onCycleSpeed={cycleSpeed}
            onSeek={seekToTick}
            onExport={() => {
              void startExport();
            }}
            onCancelExport={cancelExport}
            onDismissExportStatus={dismissStatus}
            exportStatus={exportStatus}
          />
        ) : null}

        {touchDevice && !replaying && (
          <TouchControls active={touchControlsActive} onInput={setTouch} />
        )}


      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {finished
          ? `You were caught by the lava at ${formatAltitudeLabel(
              player?.peakY ?? 0,
              0
            )}.`
          : ""}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-xl bg-void/70 backdrop-blur-xs p-4 text-center">
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
      className="mt-6 inline-flex items-center justify-center rounded-full bg-signal text-void font-semibold px-10 min-h-[60px] text-lg shadow-signal hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale]"
    >
      {label}
    </button>
  );
}
