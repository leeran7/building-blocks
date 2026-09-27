import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { buildFreeTower } from "@app/game/freeStack";
import { useClimb } from "@app/game/useClimb";
import { encodeRunReplay } from "@app/game/runReplay";
import { hazardPhase } from "@app/game/hazard";
import { TICK_HZ } from "@app/game/types";
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

import { useLevels } from "../contexts/LevelsContext";
import { tapLight, tapMedium, notifyError, notifySuccess } from "../lib/haptics";
import { useGameHaptics } from "../lib/useGameHaptics";
import {
  formatClock,
  isHardLevel,
  starsForTime,
  type LevelNode,
  type LevelResult,
  type LevelRunReport,
  type LevelTicket,
} from "../lib/levels/model";
import { StarRow } from "../components/levels/LevelBits";
import {
  LevelResultCard,
  PracticeResultCard,
  SubmitFailedCard,
} from "../components/levels/LevelResultCard";

/** Narrows router state to a ticket for this level; anything else is ignored. */
export function ticketFromState(state: unknown, level: number): LevelTicket | null {
  if (typeof state !== "object" || state === null || !("ticket" in state)) return null;
  const t = (state as { ticket: unknown }).ticket;
  if (typeof t !== "object" || t === null) return null;
  const o = t as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    o.level !== level ||
    typeof o.seed !== "string" ||
    typeof o.goalFt !== "number" ||
    typeof o.pars !== "object" ||
    o.pars === null ||
    typeof o.player !== "object" ||
    o.player === null
  ) {
    return null;
  }
  return t as LevelTicket;
}

type Stage =
  | { kind: "play" }
  | { kind: "saving"; report: LevelRunReport }
  | { kind: "result"; result: LevelResult }
  | { kind: "failed"; report: LevelRunReport }
  | { kind: "practice-over"; report: LevelRunReport };

/**
 * One level run: the climb on the level's fixed seed with a summit goal and
 * star times on the HUD, then the win or lose card. A normal run carries the
 * server's ticket in router state (the life is already spent); `?practice=1`
 * is the lives-free practice of the level, which saves nothing.
 */
export function LevelPlayScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [search] = useSearchParams();
  const practice = search.get("practice") === "1";
  const level = Number(params.level);
  const { client, season, setPlayer } = useLevels();
  const node: LevelNode | null =
    season && Number.isInteger(level) && level >= 1 && level <= season.levels.length
      ? season.levels[level - 1]
      : null;

  const [ticket, setTicket] = useState<LevelTicket | null>(() => ticketFromState(location.state, level));
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "play" });
  const [retryBusy, setRetryBusy] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  // A normal run needs a ticket; without one (app restart, stale link) go
  // back to the map rather than play a run nobody can score.
  const missing = !practice && ticket === null;
  useEffect(() => {
    if (missing) navigate("/", { replace: true });
  }, [missing, navigate]);

  const toMap = useCallback(
    (openLevel?: number) => {
      void tapLight();
      navigate("/", { replace: true, state: openLevel ? { openLevel } : null });
    },
    [navigate],
  );

  const submit = useCallback(
    async (report: LevelRunReport) => {
      if (practice || !ticket) {
        setStage({ kind: "practice-over", report });
        return;
      }
      setStage({ kind: "saving", report });
      try {
        const result = await client.submitResult(ticket.id, report);
        setPlayer(result.player);
        if (result.cleared) void notifySuccess();
        setStage({ kind: "result", result });
      } catch {
        setStage({ kind: "failed", report });
      }
    },
    [client, practice, ticket, setPlayer],
  );

  const retry = useCallback(async () => {
    if (practice) {
      setAttempt((n) => n + 1);
      setAutoStart(true);
      setStage({ kind: "play" });
      return;
    }
    setRetryBusy(true);
    try {
      const res = await client.startLevel(level);
      if (res.ok) {
        setPlayer(res.ticket.player);
        setTicket(res.ticket);
        setAutoStart(true);
        setStage({ kind: "play" });
      } else if (res.player) {
        setPlayer(res.player);
      }
    } catch {
      /* stays on the result card; Retry can be tapped again */
    } finally {
      setRetryBusy(false);
    }
  }, [client, level, practice, setPlayer]);

  if (missing) return null;
  if (!node) {
    return (
      <div role="status" className="fixed inset-0 z-40 flex items-center justify-center bg-void font-mono text-label uppercase tracking-label text-text-muted">
        Loading level…
      </div>
    );
  }

  const seed = ticket?.seed ?? node.seed;
  const goalFt = ticket?.goalFt ?? node.goalFt;
  const pars = ticket?.pars ?? node.pars;
  const runKey = practice ? `practice-${attempt}` : (ticket?.id ?? "none");
  const player = season?.player;

  return (
    <div className="fixed inset-0 z-40 bg-void">
      <LevelRun
        key={runKey}
        level={level}
        seed={seed}
        goalFt={goalFt}
        pars={pars}
        practice={practice}
        autoStart={autoStart}
        paused={stage.kind !== "play"}
        onEnd={submit}
        onQuit={() => toMap()}
      />

      {stage.kind === "saving" && (
        <div role="status" className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-surface/95 px-6 py-10 text-center font-mono text-label uppercase tracking-label text-text-secondary backdrop-blur-xl">
          Checking your run…
        </div>
      )}
      {stage.kind === "result" && (
        <LevelResultCard
          result={player ? { ...stage.result, player } : stage.result}
          costsLife={node.costsLife}
          hasNextLevel={season !== null && level < season.levels.length}
          retryBusy={retryBusy}
          onNext={() => toMap(level + 1)}
          onRetry={() => void retry()}
          onMap={() => toMap()}
          onPractice={() => navigate("/climb", { replace: true })}
          onPracticeLevel={() => navigate(`/levels/${level}/play?practice=1`, { replace: true })}
        />
      )}
      {stage.kind === "failed" && (
        <SubmitFailedCard level={level} busy={false} onRetry={() => void submit(stage.report)} onMap={() => toMap()} />
      )}
      {stage.kind === "practice-over" && (
        <PracticeResultCard
          level={level}
          goalFt={goalFt}
          peakFt={stage.report.peakFt}
          timeMs={stage.report.finishedTick !== null ? Math.round((stage.report.finishedTick / TICK_HZ) * 1000) : null}
          onRetry={() => void retry()}
          onMap={() => toMap()}
        />
      )}
    </div>
  );
}

/**
 * The climb itself. Mounted once per attempt (keyed by ticket), so a retry
 * always starts from a clean match.
 *
 * Until the engine's level finish lands (design doc §8: `goalFt` in
 * `stepMatch`), the summit is detected here from the player's height, and a
 * cleared run is reported without a replay. Once the engine marks the player
 * `finished` at the goal, its own finish tick is used instead.
 */
function LevelRun({
  level,
  seed,
  goalFt,
  pars,
  practice,
  autoStart,
  paused,
  onEnd,
  onQuit,
}: {
  level: number;
  seed: string;
  goalFt: number;
  pars: LevelNode["pars"];
  practice: boolean;
  autoStart: boolean;
  /** A result card is up: hide the controls. */
  paused: boolean;
  onEnd: (report: LevelRunReport) => void;
  onQuit: () => void;
}) {
  const towerRef = useRef(buildFreeTower());
  const { state, simRef, renderFeed, start, finished, setTouch, runId, inputLog } = useClimb({
    tower: towerRef.current,
    seed,
  });
  useGameHaptics(simRef, 0, runId);

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();
  const bottomInset = useTouchControlsInset(safeArea.bottom);

  const player = state.players[0];
  const phase = state.phase;
  const ended = useRef(false);
  const [summit, setSummit] = useState(false);
  const running = !finished && !summit && !paused;
  const touchActive = running && (phase === "countdown" || phase === "climb");

  const countdownValue = phase === "countdown" ? Math.max(1, 3 - Math.floor(state.tick / 30)) : null;
  useEffect(() => {
    if (countdownValue != null) void tapLight();
  }, [countdownValue]);

  const lavaGap = player ? player.y - state.hazardY : Infinity;
  const view = climbView(canvasSize.width, canvasSize.height, state.tower.widthM);
  const camY = cameraTargetY(player?.y ?? 0, view.viewH, bottomInset, view.pxPerM);
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
    {
      jetpackThrusting: player?.jetpackThrusting ?? false,
      lavaOnScreen: isLavaThreatening(lavaFill),
      lavaNear,
      lavaPhase: lavaPhaseInfo.phase,
      lavaFill,
      dead: player?.status === "eliminated",
    },
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

  // Summit stand-in: reaching the goal height ends the run as a clear.
  useEffect(() => {
    if (ended.current || phase !== "climb") return;
    const sim = simRef.current;
    const me = sim.players[0];
    if (!me || me.peakY < goalFt) return;
    ended.current = true;
    setSummit(true);
    void tapMedium();
    onEnd({
      finished: true,
      finishedTick: me.finishedTick ?? Math.round(sim.raceSeconds * TICK_HZ),
      peakFt: me.peakY,
      replayToken: null,
    });
  }, [state.tick, phase, goalFt, simRef, onEnd]);

  // Caught by the lava (or, once the engine has it, finished at the goal).
  useEffect(() => {
    if (!finished || ended.current) return;
    ended.current = true;
    const me = simRef.current.players[0];
    const cleared = me?.status === "finished" && me.finishedTick != null;
    if (!cleared) void notifyError();
    void (async () => {
      const replayToken = await encodeRunReplay({ seed: state.seed, peakY: me?.peakY ?? 0, inputs: inputLog });
      onEnd({
        finished: cleared,
        finishedTick: cleared ? (me.finishedTick as number) : null,
        peakFt: me?.peakY ?? 0,
        replayToken,
      });
    })();
  }, [finished, inputLog, onEnd, simRef, state.seed]);

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
      />

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
          peakFt={player?.peakY ?? 0}
          goalFt={goalFt}
          elapsedMs={state.raceSeconds * 1000}
          pars={pars}
          practice={practice}
        />
      )}

      {phase === "countdown" && (
        <Overlay>
          <p className="font-mono text-label uppercase tracking-eyebrow text-signal">Level {level}</p>
          <p key={countdownValue} className="lp-pop mt-3 font-display text-7xl font-black tabular-nums text-text-primary">
            {countdownValue}
          </p>
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
          <button
            type="button"
            onClick={handleStart}
            className="mt-8 rounded-full border-2 border-signal/70 bg-signal/10 px-12 py-4 font-display text-lg font-black uppercase tracking-[0.15em] text-signal shadow-signal transition-transform duration-150 active:scale-[0.96]"
          >
            Start
          </button>
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
}: {
  topInset: number;
  peakFt: number;
  goalFt: number;
  elapsedMs: number;
  pars: LevelNode["pars"];
  practice: boolean;
}) {
  const pct = goalFt > 0 ? Math.min(100, (peakFt / goalFt) * 100) : 0;
  const stars = starsForTime(elapsedMs, pars);
  const nextDrop = stars === 3 ? pars.threeStarMs : stars === 2 ? pars.twoStarMs : null;
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
        className="mt-1 h-2 overflow-hidden rounded-full border border-white/15 bg-void/60"
      >
        <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
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
