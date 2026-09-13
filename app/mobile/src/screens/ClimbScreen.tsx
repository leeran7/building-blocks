import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { useNavigate, useSearchParams } from "react-router-dom";

import { buildFreeTower } from "@app/game/freeStack";
import { useClimb } from "@app/game/useClimb";
import { encodeRunReplay, buildReplayUrl } from "@app/game/runReplay";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import { PowerUpHud } from "@app/components/Game/PowerUpHud";
import {
  TouchControls,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
} from "@app/components/Game/TouchControls";
import { usePowerUpFeedback } from "@app/components/Game/usePowerUpFeedback";
import {
  climbView,
  cameraTargetY,
  lavaThreatFill,
  isLavaThreatening,
} from "@app/components/Game/climbCamera";
import { useCanvasSize } from "@app/hooks/useCanvasSize";
import { useSafeAreaInsets } from "@app/hooks/useSafeAreaInsets";
import { ALTITUDE_UNIT } from "@app/lib/units";

import { API_BASE, postClimbResult, type ClimbSaveResult } from "../lib/api";
import { tapMedium, tapLight, notifyError, notifySuccess } from "../lib/haptics";
import {
  dailySeed,
  commitDailyRun,
  msUntilReset,
  formatReset,
  type DailyRunResult,
} from "../lib/daily";

const MOBILE_HUD_BAR_PX = 40;

/**
 * Native Climb — the core arcade loop. Reuses the shared deterministic engine
 * (useClimb) and the portable canvas / touch controls / power-up HUD / audio,
 * wrapped in a native, full-bleed game shell with haptics and a slide-up
 * results card. PLAY drops straight into a fresh random tower (no level select).
 */
export function ClimbScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Daily mode: lock the tower to today's shared seed so every player climbs
  // the exact same tower. Endless mode leaves the seed free (fresh each start).
  const isDaily = searchParams.get("daily") === "1";
  const seed = useMemo(() => (isDaily ? dailySeed() : undefined), [isDaily]);

  const towerRef = useRef(buildFreeTower());
  const {
    state,
    renderFeed,
    start,
    finished,
    setTouch,
    runId,
    inputLog,
  } = useClimb({ tower: towerRef.current, seed });

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();

  const [saveInfo, setSaveInfo] = useState<ClimbSaveResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [dailyResult, setDailyResult] = useState<DailyRunResult | null>(null);

  const player = state.players[0];
  const phase = state.phase;
  const touchActive = !finished && (phase === "countdown" || phase === "climb");

  // Countdown tick — one light haptic per 3·2·1 so the launch has a heartbeat.
  const countdownValue =
    phase === "countdown" ? Math.max(1, 3 - Math.floor(state.tick / 30)) : null;
  useEffect(() => {
    if (countdownValue != null) void tapLight();
  }, [countdownValue]);

  const bottomInset =
    TOUCH_CONTROLS_INSET + Math.max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom);

  // Camera + lava-threat feed the audio one-shots (see ClimbScene for rationale).
  const musicActive = !finished && (phase === "countdown" || phase === "climb");
  const lavaGap = player ? player.y - state.hazardY : Infinity;
  const musicIntensity = Math.max(0, Math.min(1, (40 - lavaGap) / 40));
  const view = climbView(canvasSize.width, canvasSize.height, state.tower.widthM);
  const camY = cameraTargetY(player?.y ?? 0, view.viewH, bottomInset, view.pxPerM);
  const lavaFill = lavaThreatFill(
    state.hazardY,
    camY,
    view.viewH,
    view.pxPerM > 0 ? bottomInset / view.pxPerM : 0,
  );
  const { muted, setMuted, announcement, unlockAudio } = usePowerUpFeedback(
    player,
    state.tick,
    runId,
    { active: musicActive, intensity: musicIntensity },
    {
      jetpackThrusting: player?.jetpackThrusting ?? false,
      lavaOnScreen: isLavaThreatening(lavaFill),
      lavaFill,
      dead: player?.status === "eliminated",
    },
  );

  const handleStart = useCallback(() => {
    unlockAudio();
    void tapMedium();
    setPosted(false);
    setSaveInfo(null);
    setShareUrl(null);
    setDailyResult(null);
    start();
  }, [start, unlockAudio]);

  // Death haptic — one buzz when the run ends. In daily mode, also record the
  // run locally (streak + today's best) before showing results.
  useEffect(() => {
    if (!finished) return;
    void notifyError();
    if (isDaily && player) setDailyResult(commitDailyRun(player.peakY ?? 0));
    // player identity is stable within a finished run; keep deps minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, isDaily]);

  // Save + encode share link once the run finishes (guest-safe).
  useEffect(() => {
    if (!finished || posted || inputLog.length === 0) return;
    setPosted(true);
    const run = {
      peakY: player?.peakY ?? 0,
      finished: player?.status === "finished",
      finishedTick: player?.finishedTick ?? null,
      ticks: state.tick,
      seed: state.seed,
    };
    (async () => {
      const replayToken = await encodeRunReplay({
        seed: run.seed,
        peakY: run.peakY,
        inputs: inputLog,
      });
      // Share URLs point at the public site, not the capacitor:// origin.
      if (replayToken) setShareUrl(buildReplayUrl(replayToken, API_BASE));
      const payload = replayToken ? { ...run, replayToken } : run;
      const result = await postClimbResult(payload);
      setSaveInfo(result);
      if (result.saved && result.improved) void notifySuccess();
    })();
  }, [finished, posted, inputLog, player, state.seed, state.tick]);

  const share = useCallback(async () => {
    if (!shareUrl) return;
    void tapLight();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Doomstack", url: shareUrl });
        return;
      }
      await navigator.clipboard?.writeText(shareUrl);
    } catch {
      /* user cancelled / unavailable */
    }
  }, [shareUrl]);

  return (
    <div className="fixed inset-0 z-40 bg-void">
      {/* Power-up strip — overlaid at the top of the full-bleed stage. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20"
        style={{
          paddingTop: safeArea.top + MOBILE_HUD_BAR_PX,
          paddingLeft: `max(8px, ${safeArea.left}px)`,
          paddingRight: `max(8px, ${safeArea.right}px)`,
        }}
      >
        <div className="pointer-events-auto">
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

      <div
        ref={canvasBoxRef}
        data-climb-surface
        className="relative h-full w-full overflow-hidden"
      >
        <ClimbCanvas
          state={state}
          feed={renderFeed}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed
          hudInsetTop={safeArea.top}
        />

        {phase === "countdown" && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-signal">
              get ready
            </p>
            <p
              key={countdownValue}
              className="cd-pop mt-3 font-display text-8xl font-black tabular-nums text-text-primary"
            >
              {countdownValue}
            </p>
            <style>{`
              .cd-pop { animation: cdPop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
              @keyframes cdPop {
                from { transform: scale(1.7); opacity: 0; }
                to   { transform: scale(1);   opacity: 1; }
              }
              @media (prefers-reduced-motion: reduce) { .cd-pop { animation: none; } }
            `}</style>
          </Overlay>
        )}

        {phase === "lobby" && (
          <Overlay>
            <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-signal">
              {isDaily ? "daily challenge" : "endless climb"}
            </span>
            <h2 className="mt-3 font-display text-5xl font-black uppercase leading-none tracking-tight text-text-primary">
              {isDaily ? "Daily" : "Climb"}
            </h2>
            <span className="mt-4 h-px w-14 bg-border-strong" />
            <p className="mt-4 max-w-[280px] text-center text-sm leading-relaxed text-text-secondary">
              {isDaily
                ? "Everyone climbs the same tower today. One seed, one shot at the top of the daily board."
                : "Go as high as you can before the rising lava catches you. Grab glowing orbs for power-ups."}
            </p>
            {isDaily && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                Resets in {formatReset(msUntilReset())}
              </p>
            )}
            <StartButton onClick={handleStart} label={isDaily ? "Start daily" : "Start climb"} />
          </Overlay>
        )}

        {finished && (
          <ResultsCard
            peakY={player?.peakY ?? 0}
            saveInfo={saveInfo}
            dailyResult={isDaily ? dailyResult : null}
            shareable={Boolean(shareUrl)}
            onPlayAgain={handleStart}
            onShare={share}
            onHome={() => {
              void tapLight();
              navigate("/");
            }}
          />
        )}
      </div>

      {touchActive && <TouchControls active={touchActive} onInput={setTouch} />}
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

function StartButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-8 rounded-full border-2 border-signal/70 bg-signal/10 px-12 py-4 font-display text-lg font-black uppercase tracking-[0.15em] text-signal shadow-signal transition-transform duration-150 active:scale-[0.96]"
    >
      {label}
    </button>
  );
}

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() =>
    prefersReducedMotion() ? target : 0,
  );
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setValue(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function ResultsCard({
  peakY,
  saveInfo,
  dailyResult,
  shareable,
  onPlayAgain,
  onShare,
  onHome,
}: {
  peakY: number;
  saveInfo: ClimbSaveResult | null;
  dailyResult: DailyRunResult | null;
  shareable: boolean;
  onPlayAgain: () => void;
  onShare: () => void;
  onHome: () => void;
}) {
  const shown = useCountUp(peakY);
  const isBest = Boolean(saveInfo?.saved && saveInfo.improved);
  // Real percentile from the leaderboard rank, when we have both numbers.
  const topPct =
    saveInfo?.saved && saveInfo.rank && saveInfo.totalClimbers
      ? Math.max(1, Math.round((saveInfo.rank / saveInfo.totalClimbers) * 100))
      : null;
  const rankLine = saveInfo?.saved && saveInfo.rank
    ? `#${saveInfo.rank}${saveInfo.totalClimbers ? ` of ${saveInfo.totalClimbers.toLocaleString()}` : ""}${topPct ? ` · top ${topPct}%` : ""}`
    : "your highest climb";
  return (
    <div className="rc-card absolute inset-x-0 bottom-0 z-30 animate-[resultsUp_0.28s_cubic-bezier(0.16,1,0.3,1)] rounded-t-3xl border-t border-border-strong bg-surface/95 px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-3 backdrop-blur-xl">
      {/* iOS sheet grabber */}
      <span aria-hidden className="mx-auto mb-5 block h-1 w-9 rounded-full bg-border-strong" />
      <style>{`
        @keyframes resultsUp { from { transform: translateY(100%);} to { transform: translateY(0);} }
        @keyframes rcBestPop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .rc-best-pill { animation: rcBestPop 0.4s 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .rc-best-glow { text-shadow: 0 0 40px rgba(203,242,77,0.5); }
        @media (prefers-reduced-motion: reduce) {
          .rc-best-pill { animation: none; }
          .rc-card { animation: none; }
        }
      `}</style>

      {isBest ? (
        <p className="rc-best-pill mx-auto flex w-fit items-center gap-1.5 rounded-full border border-signal/40 bg-signal/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-signal">
          ★ New Best
        </p>
      ) : (
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
          caught by the lava
        </p>
      )}

      <h2
        className={`mt-3 text-center font-mono text-[4.5rem] font-bold leading-none tabular-nums text-signal${isBest ? " rc-best-glow" : ""}`}
      >
        {Math.round(shown).toLocaleString()}
        <span className="ml-1 align-baseline text-2xl font-normal text-text-muted">
          {ALTITUDE_UNIT}
        </span>
      </h2>
      <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">
        {rankLine}
      </p>

      {dailyResult && (
        <p className="rc-best-pill mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-ember/40 bg-ember/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
          <span className="text-sm">🔥</span>
          {dailyResult.streakExtended
            ? `${dailyResult.streak}-day streak`
            : `Daily streak ${dailyResult.streak}`}
          {dailyResult.isDayBest && (
            <span className="text-signal">· today’s best</span>
          )}
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3">
        <button
          onClick={onPlayAgain}
          className="min-h-[52px] rounded-full bg-signal font-display text-base font-black uppercase tracking-widest text-void shadow-signal transition-transform duration-150 active:scale-[0.97]"
        >
          Play again
        </button>
        <div className="flex gap-3">
          {shareable && (
            <button
              onClick={onShare}
              className="min-h-[52px] flex-1 rounded-full border border-border-strong bg-surface-raised font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform duration-150 active:scale-[0.97]"
            >
              Share
            </button>
          )}
          <button
            onClick={onHome}
            className="min-h-[52px] flex-1 rounded-full border border-border-strong bg-surface-raised font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform duration-150 active:scale-[0.97]"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
