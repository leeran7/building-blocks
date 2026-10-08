/**
 * The portal's whole game: a menu with one Start button, the endless Free
 * Climb, pause, and a results card with Play again.
 *
 * Built from the same engine pieces as the app's ClimbScreen (useClimb,
 * ClimbCanvas, ExpeditionHud, TouchControls, usePowerUpFeedback) without its
 * account, API, replay or share code, so none of that ships in a portal.
 * Host-facing calls go through the target's PlatformAdapter and AdsAdapter.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { buildFreeTower } from "@app/game/freeStack";
import { useClimb } from "@app/game/useClimb";
import { hazardPhase } from "@app/game/hazard";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import { ExpeditionHud } from "@app/components/Game/ExpeditionHud";
import { TouchControls, touchControlsInset } from "@app/components/Game/TouchControls";
import { usePowerUpFeedback } from "@app/components/Game/usePowerUpFeedback";
import { lavaMusicIntensity } from "@app/components/Game/powerUpCues";
import { isLavaInProximity } from "@app/components/Game/lava";
import {
  cameraTargetY,
  climbView,
  isLavaThreatening,
  lavaGapBelowViewM,
  lavaThreatFill,
} from "@app/components/Game/climbCamera";
import { useCoarsePointer } from "@app/hooks/useCoarsePointer";
import { useSafeAreaInsets } from "@app/hooks/useSafeAreaInsets";
import { ALTITUDE_UNIT } from "@app/lib/units";

import type { AdsAdapter, PlatformAdapter } from "../targets/types";
import { prefersReducedMotion } from "../lib/motion";
import { requestBreak } from "./adBreak";
import { saveBest, settleRun, type RunSettlement } from "./bestHeight";
import { portalCanvasSize } from "./layout";
import { useFrameSize } from "./useFrameSize";

/** Results ignore input this long after death, so a held jump cannot restart (or request an ad). */
export const RESULTS_INPUT_GUARD_MS = 600;
/** Sim ticks per countdown second (simulation runs at 30 Hz). */
const TICKS_PER_SECOND = 30;
const COUNTDOWN_SECONDS = 3;

export interface PortalRunProps {
  platform: PlatformAdapter;
  ads: AdsAdapter;
  /** Best height saved on this device; null while loading or when none is saved. */
  best: number | null;
  /** A run went higher than `best`. */
  onBest: (best: number) => void;
  /** False while the host says audio must stay off. */
  audioAllowed: boolean;
  /** True while the host has paused the game (overlay, hidden tab). */
  hostPaused: boolean;
}

type RunResult = RunSettlement & { peak: number };

export function PortalRun({ platform, ads, best, onBest, audioAllowed, hostPaused }: PortalRunProps) {
  const [tower] = useState(buildFreeTower);
  const [userPaused, setUserPaused] = useState(false);
  const paused = userPaused || hostPaused;
  const { state, renderFeed, start, finished, setTouch, runId } = useClimb({ tower, paused });

  const player = state.players[0];
  const phase = state.phase;
  const runActive = !finished && (phase === "countdown" || phase === "climb");
  const live = runActive && !paused;

  const frame = useFrameSize();
  const canvas = portalCanvasSize(frame.width, frame.height);
  const touch = useCoarsePointer();
  const safeArea = useSafeAreaInsets();
  const bottomInset = touch ? touchControlsInset(safeArea.bottom) : 0;
  const [reducedMotion] = useState(prefersReducedMotion);

  // Camera and lava threat feed the audio, as in the app's climb screen.
  const view = climbView(canvas.width, canvas.height, state.tower.widthM);
  const camY = cameraTargetY(player?.y ?? 0, view.viewH, bottomInset, view.pxPerM);
  const bottomInsetM = view.pxPerM > 0 ? bottomInset / view.pxPerM : 0;
  const lavaFill = lavaThreatFill(state.hazardY, camY, view.viewH, bottomInsetM);
  const lavaNear = isLavaInProximity(lavaGapBelowViewM(state.hazardY, camY, bottomInset, view.pxPerM));
  const lavaPhaseInfo = hazardPhase(state.raceSeconds - state.hazardSlowSeconds);
  const lavaGap = player ? player.y - state.hazardY : Infinity;

  // Ad audio goes off only once the ad has actually started.
  const [adAudioOff, setAdAudioOff] = useState(false);
  const { muted, setMuted, announcement, unlockAudio } = usePowerUpFeedback(
    player,
    state.tick,
    runId,
    { active: live, intensity: lavaMusicIntensity(lavaGap) },
    {
      // World loops hold while paused rather than droning over a frozen frame.
      jetpackThrusting: live && (player?.jetpackThrusting ?? false),
      lavaOnScreen: live && isLavaThreatening(lavaFill),
      lavaNear: live && lavaNear,
      lavaPhase: lavaPhaseInfo.phase,
      lavaFill: live ? lavaFill : 0,
      dead: player?.status === "eliminated",
    },
    { silenced: !audioAllowed || adAudioOff },
  );
  const unlockRef = useRef(unlockAudio);
  unlockRef.current = unlockAudio;

  // gameplayStart on every rising edge of a live run (start, resume), stop on
  // every falling edge (death, pause). Nothing at mount: the menu is not play.
  const wasLive = useRef(false);
  useEffect(() => {
    if (live === wasLive.current) return;
    wasLive.current = live;
    if (live) platform.gameplayStart();
    else platform.gameplayStop();
  }, [live, platform]);

  // A host pause mid-run stays paused after the host resumes, until the
  // player chooses to carry on: their hands may not be on the controls.
  useEffect(() => {
    if (hostPaused && runActive) setUserPaused(true);
  }, [hostPaused, runActive]);

  const runActiveRef = useRef(runActive);
  runActiveRef.current = runActive;
  const hostPausedRef = useRef(hostPaused);
  hostPausedRef.current = hostPaused;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !runActiveRef.current) return;
      // While the host has paused us (an ad, a hidden tab), P must not queue a resume.
      if (hostPausedRef.current) return;
      e.preventDefault();
      unlockRef.current();
      setUserPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Settle each finished run once: best, save, and the host's happy moment.
  const bestRef = useRef(best);
  bestRef.current = best;
  const settledRun = useRef(0);
  const [result, setResult] = useState<RunResult | null>(null);
  useEffect(() => {
    if (!finished || runId === 0 || settledRun.current === runId) return;
    settledRun.current = runId;
    const peak = player?.peakY ?? 0;
    const settled = settleRun(bestRef.current, peak);
    setResult({ ...settled, peak });
    if (settled.improved) {
      onBest(settled.best);
      void saveBest(platform, settled.best);
    }
    if (settled.newBest) platform.happyMoment();
  }, [finished, runId, player, platform, onBest]);

  const [resultsArmed, setResultsArmed] = useState(false);
  useEffect(() => {
    if (!finished) {
      setResultsArmed(false);
      return;
    }
    const timer = setTimeout(() => setResultsArmed(true), RESULTS_INPUT_GUARD_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  const begin = useCallback(() => {
    setUserPaused(false);
    setResult(null);
    start();
  }, [start]);

  const handleStart = () => {
    unlockAudio();
    begin();
  };

  // Play again is the only ad break: blocked input until the ad settles, then
  // the run starts whatever the ad did.
  const [breakBusy, setBreakBusy] = useState(false);
  const breakRef = useRef(false);
  const handlePlayAgain = async () => {
    if (breakRef.current) return;
    breakRef.current = true;
    unlockAudio();
    setBreakBusy(true);
    await requestBreak(ads, () => setAdAudioOff(true));
    setAdAudioOff(false);
    setBreakBusy(false);
    breakRef.current = false;
    begin();
  };

  const handleResume = () => {
    unlockAudio();
    setUserPaused(false);
  };

  const countdown =
    phase === "countdown" ? Math.max(1, COUNTDOWN_SECONDS - Math.floor(state.tick / TICKS_PER_SECOND)) : null;

  return (
    <div
      data-portal-game
      className="fixed inset-0 select-none overflow-hidden bg-void"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div data-climb-surface className="exp-stage relative h-full w-full overflow-hidden">
        <div className="absolute inset-0 flex justify-center">
          <ClimbCanvas
            state={state}
            feed={renderFeed}
            width={canvas.width}
            height={canvas.height}
            reducedMotion={reducedMotion}
            bottomInset={bottomInset}
            fullBleed
            hudInsetTop={safeArea.top}
            includeHud={false}
            floorMarkerInsetTop={safeArea.top + 80}
          />
        </div>

        {phase !== "lobby" && (
          <ExpeditionHud
            player={player}
            hazardY={state.hazardY}
            tick={state.tick}
            lavaPhase={lavaPhaseInfo.phase}
            lavaPhaseProgress={lavaPhaseInfo.progress}
            muted={muted}
            onToggleMute={() => setMuted(!muted)}
            announcement={announcement}
            runId={runId}
            topInset={safeArea.top}
            leftInset={safeArea.left}
            rightInset={safeArea.right}
            settingsEscapeCloses={false}
            backControl={runActive ? <PauseButton onPause={() => setUserPaused(true)} /> : undefined}
          />
        )}

        {phase === "lobby" && (
          <Menu best={best} touch={touch} muted={muted} onToggleMute={() => setMuted(!muted)} onStart={handleStart} />
        )}

        {countdown !== null && !paused && <Countdown value={countdown} />}

        {runActive && paused && <PausedCard touch={touch} hostPaused={hostPaused} onResume={handleResume} />}

        {finished && (
          <Results
            result={result}
            best={best}
            armed={resultsArmed && !breakBusy}
            onPlayAgain={() => void handlePlayAgain()}
          />
        )}

        {touch && runActive && <TouchControls active={live} onInput={setTouch} />}

        {breakBusy && (
          <div data-ad-break className="absolute inset-0 z-50" role="status" aria-busy="true">
            <span className="sr-only">Ad break</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Overlay({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-void/75 px-6 py-4 text-center backdrop-blur-md"
    >
      {children}
    </section>
  );
}

const PRIMARY_BUTTON =
  "mt-6 min-h-[52px] min-w-[200px] rounded-full bg-signal px-10 font-display text-lg font-black uppercase tracking-[0.15em] text-void shadow-signal transition-transform duration-150 active:scale-[0.97] disabled:opacity-60";

function Menu({
  best,
  touch,
  muted,
  onToggleMute,
  onStart,
}: {
  best: number | null;
  touch: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
}) {
  return (
    <Overlay label="Doomstack">
      <SoundToggle muted={muted} onToggle={onToggleMute} />
      <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-signal">endless climb</p>
      <h1 className="mt-2 font-display text-5xl font-black uppercase leading-none tracking-tight text-text-primary">
        Doomstack
      </h1>
      <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-text-secondary">
        Climb as high as you can before the rising lava catches you. Grab glowing orbs for power-ups.
      </p>
      {best !== null && best > 0 && (
        <p className="mt-3 font-mono text-label uppercase tracking-label text-text-secondary">
          Best {Math.round(best).toLocaleString("en-US")} {ALTITUDE_UNIT}
        </p>
      )}
      <button type="button" autoFocus className={PRIMARY_BUTTON} onClick={onStart}>
        Start
      </button>
      <p className="mt-4 max-w-[320px] font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
        {touch ? "Move, climb and jump with the buttons" : "Arrows or WASD to move and climb · Space to jump · P to pause"}
      </p>
    </Overlay>
  );
}

function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      aria-label="Sound"
      title={muted ? "Sound off" : "Sound on"}
      className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-surface/80 text-text-primary"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

function PauseButton({ onPause }: { onPause: () => void }) {
  return (
    <button type="button" data-game-control className="exp-utility" aria-label="Pause" title="Pause (P)" onClick={onPause}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    </button>
  );
}

function Countdown({ value }: { value: number }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-void/40">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal">get ready</p>
      <p key={value} className="mt-3 font-display text-7xl font-black tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}

function PausedCard({ touch, hostPaused, onResume }: { touch: boolean; hostPaused: boolean; onResume: () => void }) {
  return (
    <Overlay label="Paused">
      <h2 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-text-primary">Paused</h2>
      <button type="button" autoFocus className={PRIMARY_BUTTON} onClick={onResume} disabled={hostPaused}>
        Resume
      </button>
      {!touch && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">P to resume</p>
      )}
    </Overlay>
  );
}

function Results({
  result,
  best,
  armed,
  onPlayAgain,
}: {
  result: RunResult | null;
  best: number | null;
  armed: boolean;
  onPlayAgain: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (armed) buttonRef.current?.focus({ preventScroll: true });
  }, [armed]);
  const peak = Math.round(result?.peak ?? 0);
  // The saved best may load after the run settled: show the higher.
  const shownBest = Math.max(result?.best ?? 0, best ?? 0);
  return (
    <Overlay label="Run over">
      {result?.newBest ? (
        <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-signal/40 bg-signal/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-signal">
          ★ New best
        </p>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember">caught by the lava</p>
      )}
      <p aria-live="polite" className="mt-3 font-mono text-6xl font-bold leading-none tabular-nums text-signal">
        {peak.toLocaleString("en-US")}
        <span className="ml-1 align-baseline text-2xl font-normal text-text-secondary">{ALTITUDE_UNIT}</span>
      </p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-secondary">
        {shownBest > 0
          ? `Best ${Math.round(shownBest).toLocaleString("en-US")} ${ALTITUDE_UNIT}`
          : "your highest climb"}
      </p>
      <button ref={buttonRef} type="button" className={PRIMARY_BUTTON} onClick={onPlayAgain} disabled={!armed}>
        Play again
      </button>
    </Overlay>
  );
}
