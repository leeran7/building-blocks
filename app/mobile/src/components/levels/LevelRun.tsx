import { useCallback, useEffect, useRef } from "react";

import { buildFreeTower } from "@app/game/freeStack";
import { useClimb } from "@app/game/useClimb";
import { levelTimeLimitTicks } from "@app/game/simulation";
import { encodeRunReplay } from "@app/game/runReplay";
import { hazardPhase } from "@app/game/hazard";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import { ExpeditionHud } from "@app/components/Game/ExpeditionHud";
import { TouchControls, useTouchControlsInset } from "@app/components/Game/TouchControls";
import { usePowerUpFeedback } from "@app/components/Game/usePowerUpFeedback";
import { lavaMusicIntensity } from "@app/components/Game/powerUpCues";
import { isLavaInProximity } from "@app/components/Game/lava";
import {
  climbView,
  cameraTargetY,
  lavaThreatFill,
  isLavaThreatening,
  lavaGapBelowViewM,
} from "@app/components/Game/climbCamera";
import { useCanvasSize } from "@app/hooks/useCanvasSize";
import { useSafeAreaInsets } from "@app/hooks/useSafeAreaInsets";
import { ALTITUDE_UNIT } from "@app/lib/units";

import { tapLight, tapMedium, notifyError } from "../../lib/haptics";
import { useGameHaptics } from "../../lib/useGameHaptics";
import {
  formatClock,
  isHardLevel,
  starsForTime,
  type LevelNode,
  type LevelRunReport,
} from "../../lib/levels/model";
import type { LevelRunSetup } from "../../lib/levels/catalog";
import { useSettings } from "../../contexts/AppDataContext";
import type { BoosterType, StartPowerUp } from "@app/levels/engagement";
import { StarRow } from "./LevelBits";
import { PowerUpName, PowerUpNames } from "./LevelStartExtras";

/** No start power-ups (a stable default). */
const NONE: readonly StartPowerUp[] = [];

/**
 * The climb itself, on the level's tower and lava from the season manifest
 * (`setup`); the tower's goal height (`goalM`) finishes the climber at the
 * summit.
 * Mounted once per attempt (keyed by ticket), so a retry always starts from a
 * clean match.
 */
export function LevelRun({
  level,
  seed,
  goalFt,
  pars,
  setup,
  practice,
  autoStart,
  paused,
  onEnd,
  onQuit,
  startPowerUps = NONE,
  boosterKept = null,
  bestFailFt = null,
  onHowToPlay,
}: {
  level: number;
  seed: string;
  goalFt: number;
  pars: LevelNode["pars"];
  /** The level's tower and lava; without one, the free stack capped at the goal. */
  setup?: LevelRunSetup;
  practice: boolean;
  autoStart: boolean;
  /** A result card is up: hide the controls. */
  paused: boolean;
  onEnd: (report: LevelRunReport) => void;
  onQuit: () => void;
  /** The ticket's power-ups (a free one, then a booster), granted by the engine at GO. */
  startPowerUps?: readonly StartPowerUp[];
  /** A chosen booster the server kept: the run's free power-up is its type. */
  boosterKept?: BoosterType | null;
  /** Best failed height on this level when it came close (§6.2), ft. */
  bestFailFt?: number | null;
  /** Replays the level's tutorial from the start screen. */
  onHowToPlay?: () => void;
}) {
  const towerRef = useRef(setup?.tower ?? { ...buildFreeTower(), goalM: goalFt });
  const { state, simRef, renderFeed, start, finished, setTouch, runId, inputLog } = useClimb({
    tower: towerRef.current,
    seed,
    hazard: setup?.hazard,
    ...(startPowerUps.length > 0 ? { startPowerUps: startPowerUps.map((p) => p.type) } : {}),
  });
  useGameHaptics(simRef, 0, runId);

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  // The climber draws as the player's avatar (the Green Stick for guests / none).
  const myAvatarId = useSettings().data?.avatarId ?? null;
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();
  const bottomInset = useTouchControlsInset(safeArea.bottom);

  const phase = state.phase;
  const ended = useRef(false);
  const running = !finished && !paused;
  // Feed the audio nothing once the run is over, so no lava or death cue
  // plays over the result card.
  const player = running ? state.players[0] : undefined;
  const touchActive = running && (phase === "countdown" || phase === "climb");

  const countdownValue = phase === "countdown" ? Math.max(1, 3 - Math.floor(state.tick / 30)) : null;
  useEffect(() => {
    if (countdownValue != null) void tapLight();
  }, [countdownValue]);

  const lavaGap = player ? player.y - state.hazardY : Infinity;
  const view = climbView(canvasSize.width, canvasSize.height, state.tower.widthM);
  const camY = cameraTargetY(state.players[0]?.y ?? 0, view.viewH, bottomInset, view.pxPerM);
  const lavaPhaseInfo = hazardPhase(state.raceSeconds - state.hazardSlowSeconds);
  const bottomInsetM = view.pxPerM > 0 ? bottomInset / view.pxPerM : 0;
  const lavaFill = lavaThreatFill(state.hazardY, camY, view.viewH, bottomInsetM);
  const lavaNear = isLavaInProximity(lavaGapBelowViewM(state.hazardY, camY, bottomInset, view.pxPerM));
  const musicActive = running && (phase === "countdown" || phase === "climb");
  const { muted, setMuted, announcement, unlockAudio } = usePowerUpFeedback(
    player,
    state.tick,
    runId,
    { active: musicActive, intensity: lavaMusicIntensity(lavaGap) },
    running
      ? {
          jetpackThrusting: player?.jetpackThrusting ?? false,
          lavaOnScreen: isLavaThreatening(lavaFill),
          lavaNear,
          lavaPhase: lavaPhaseInfo.phase,
          lavaFill,
          dead: player?.status === "eliminated",
        }
      : undefined,
  );

  const handleStart = useCallback(() => {
    unlockAudio();
    void tapMedium();
    start();
  }, [start, unlockAudio]);

  // One-tap retry: the next attempt starts straight into the countdown.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    handleStart();
  }, [autoStart, handleStart]);

  // The run ended: finished at the summit, or caught by the lava.
  // useClimb publishes the input log in its own effect after `finished`
  // flips, so wait for it, as ClimbScreen does, or the replay is empty.
  useEffect(() => {
    if (!finished || ended.current || inputLog.length === 0) return;
    ended.current = true;
    const me = simRef.current.players[0];
    // finishedTick counts from GO: the engine resets the tick after the countdown.
    const finishTick = me?.status === "finished" && me.finishedTick != null ? me.finishedTick : null;
    const reached = finishTick !== null;
    const raceTicks = Math.max(0, simRef.current.tick);
    const limit = levelTimeLimitTicks(simRef.current.tower);
    const outOfTime = !reached && limit !== null && me?.finishedTick != null && me.finishedTick >= limit;
    if (reached) void tapMedium();
    else void notifyError();
    void (async () => {
      const replayToken = await encodeRunReplay({ seed: state.seed, peakY: me?.peakY ?? 0, inputs: inputLog });
      onEnd({
        level,
        finished: reached,
        finishedTick: finishTick,
        raceTicks: finishTick ?? raceTicks,
        peakFt: me?.peakY ?? 0,
        replayToken,
        outOfTime,
      });
    })();
  }, [finished, inputLog, level, onEnd, simRef, state.seed]);

  return (
    <div ref={canvasBoxRef} data-climb-surface className="exp-stage relative h-full w-full overflow-hidden">
      <ClimbCanvas
        state={state}
        feed={renderFeed}
        width={canvasSize.width}
        height={canvasSize.height}
        bottomInset={bottomInset}
        fullBleed
        hudInsetTop={safeArea.top}
        includeHud={false}
        floorMarkerInsetTop={safeArea.top + 80}
        myAvatarId={myAvatarId}
      />

      <ExpeditionHud
        player={state.players[0]}
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
        backControl={
          <button
            type="button"
            data-game-control
            className="exp-utility"
            aria-label="Back to the level map"
            title="Back to the level map"
            onClick={onQuit}
          >
            ←
          </button>
        }
      />

      {(phase === "climb" || phase === "countdown") && (
        <GoalBar
          topInset={safeArea.top}
          peakFt={state.players[0]?.peakY ?? 0}
          goalFt={goalFt}
          elapsedMs={state.raceSeconds * 1000}
          pars={pars}
          practice={practice}
          bestFailFt={bestFailFt}
        />
      )}

      {phase === "countdown" && (
        <Overlay>
          <p className="font-mono text-label uppercase tracking-eyebrow text-signal">Level {level}</p>
          <p key={countdownValue} className="lp-pop mt-3 font-display text-7xl font-black tabular-nums text-text-primary">
            {countdownValue}
          </p>
          {startPowerUps.length > 0 && (
            <p className="mt-4 text-meta text-text-primary">
              Starts with <PowerUpNames powerUps={startPowerUps} />
            </p>
          )}
        </Overlay>
      )}

      {phase === "lobby" && !autoStart && (
        <Overlay>
          <span className={`font-mono text-label uppercase tracking-eyebrow ${isHardLevel(level) ? "text-ember" : "text-signal"}`}>
            {practice ? "Practice" : isHardLevel(level) ? "Hard level" : "Level"}
          </span>
          <h2 className="mt-2 font-display text-5xl font-black uppercase leading-none tracking-tight text-text-primary">
            Level {level}
          </h2>
          <span className="mt-4 h-px w-14 bg-border-strong" />
          <p className="mt-4 max-w-[280px] text-center text-body text-text-secondary">
            Reach the summit at {goalFt.toLocaleString()} {ALTITUDE_UNIT} before the lava catches you.
          </p>
          {startPowerUps.length > 0 && (
            <p className="mt-3 text-meta text-text-primary">
              You start with <PowerUpNames powerUps={startPowerUps} /> at GO.
            </p>
          )}
          {boosterKept && (
            <p className="mt-2 max-w-[280px] text-center text-meta text-text-secondary">
              Your <PowerUpName type={boosterKept} /> booster was kept: this run already starts with it.
            </p>
          )}
          <button
            type="button"
            onClick={handleStart}
            className="mt-8 rounded-full border-2 border-signal/70 bg-signal/10 px-12 py-4 font-display text-lg font-black uppercase tracking-[0.15em] text-signal shadow-signal transition-transform duration-150 active:scale-[0.96]"
          >
            Start
          </button>
          {onHowToPlay && (
            <button
              type="button"
              onClick={onHowToPlay}
              className="mt-4 min-h-[44px] px-4 font-mono text-label uppercase tracking-label text-text-secondary underline-offset-4 active:scale-95"
            >
              How to play
            </button>
          )}
        </Overlay>
      )}

      {touchActive && <TouchControls active={touchActive} onInput={setTouch} />}
      <style>{`
        .lp-pop { animation: lpPop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes lpPop { from { transform: scale(1.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lp-pop { animation: none; } }
      `}</style>
    </div>
  );
}

/**
 * Progress to the summit, with the stars still on offer: nobody reads a timer
 * while dodging lava, so the stars drop off the bar as each par passes (§4).
 */
export function GoalBar({
  topInset,
  peakFt,
  goalFt,
  elapsedMs,
  pars,
  practice,
  bestFailFt = null,
}: {
  topInset: number;
  peakFt: number;
  goalFt: number;
  elapsedMs: number;
  pars: LevelNode["pars"];
  /** The level's tower and lava; without one, the free stack capped at the goal. */
  setup?: LevelRunSetup;
  practice: boolean;
  /** Where the best failed attempt ended, marked on the bar (§6.2), ft. */
  bestFailFt?: number | null;
}) {
  const markPct = bestFailFt !== null && goalFt > 0 ? Math.min(100, (bestFailFt / goalFt) * 100) : null;
  const pct = goalFt > 0 ? Math.min(100, (peakFt / goalFt) * 100) : 0;
  const stars = starsForTime(elapsedMs, pars);
  const nextDrop =
    stars === 3 ? pars.threeStarMs : stars === 2 ? pars.twoStarMs : stars === 1 ? pars.oneStarMs : null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 w-[min(84vw,320px)] -translate-x-1/2"
      style={{ top: topInset + 104 }}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-label font-bold uppercase tracking-label text-text-primary [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {practice ? <span className="text-text-secondary">Practice</span> : <StarRow count={stars} size={14} />}
        <span className="tabular-nums">
          {nextDrop !== null && !practice ? formatClock(nextDrop - elapsedMs) : ""}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progress to the summit"
        aria-valuemin={0}
        aria-valuemax={goalFt}
        aria-valuenow={Math.round(peakFt)}
        className="relative mt-1 h-2 overflow-hidden rounded-full border border-white/15 bg-void/60"
      >
        <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
        {markPct !== null && (
          <span
            data-testid="best-fail-marker"
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-ember"
            style={{ left: `calc(${markPct}% - 1px)` }}
          />
        )}
      </div>
      {bestFailFt !== null && (
        <p className="sr-only">Your best try reached {Math.round(bestFailFt)} {ALTITUDE_UNIT}</p>
      )}
      <p className="mt-0.5 text-right font-mono text-[10px] font-bold uppercase tracking-label text-text-secondary [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        Summit {goalFt.toLocaleString()} {ALTITUDE_UNIT}
      </p>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-void/75 px-6 backdrop-blur-md">
      {children}
    </div>
  );
}
