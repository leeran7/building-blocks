import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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

const MOBILE_HUD_BAR_PX = 40;

/**
 * Native Climb — the core arcade loop. Reuses the shared deterministic engine
 * (useClimb) and the portable canvas / touch controls / power-up HUD / audio,
 * wrapped in a native, full-bleed game shell with haptics and a slide-up
 * results card. PLAY drops straight into a fresh random tower (no level select).
 */
export function ClimbScreen() {
  const navigate = useNavigate();
  const towerRef = useRef(buildFreeTower());
  const {
    state,
    renderFeed,
    start,
    finished,
    setTouch,
    runId,
    inputLog,
  } = useClimb({ tower: towerRef.current });

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();

  const [saveInfo, setSaveInfo] = useState<ClimbSaveResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const player = state.players[0];
  const phase = state.phase;
  const touchActive = !finished && (phase === "countdown" || phase === "climb");

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
    start();
  }, [start, unlockAudio]);

  // Death haptic — one buzz when the run ends.
  useEffect(() => {
    if (finished) void notifyError();
  }, [finished]);

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
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ get ready ]
            </p>
            <p className="mt-3 font-display text-7xl tabular-nums text-text-primary">
              {Math.max(1, 3 - Math.floor(state.tick / 30))}
            </p>
          </Overlay>
        )}

        {phase === "lobby" && (
          <Overlay>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
              [ endless climb ]
            </p>
            <h2 className="mt-2 font-display text-4xl font-black uppercase text-text-primary">
              Climb
            </h2>
            <p className="mt-3 max-w-[280px] text-center text-sm leading-relaxed text-text-secondary">
              Go as high as you can before the rising lava catches you. Grab
              glowing orbs for power-ups.
            </p>
            <StartButton onClick={handleStart} label="Start climb" />
          </Overlay>
        )}

        {finished && (
          <ResultsCard
            peakY={player?.peakY ?? 0}
            saveInfo={saveInfo}
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
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-void/70 px-6 backdrop-blur-sm">
      {children}
    </div>
  );
}

function StartButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-7 rounded-full border-2 border-signal/70 bg-signal/10 px-12 py-4 font-display text-lg font-black uppercase tracking-widest text-signal shadow-signal transition-transform active:scale-95"
    >
      {label}
    </button>
  );
}

function ResultsCard({
  peakY,
  saveInfo,
  shareable,
  onPlayAgain,
  onShare,
  onHome,
}: {
  peakY: number;
  saveInfo: ClimbSaveResult | null;
  shareable: boolean;
  onPlayAgain: () => void;
  onShare: () => void;
  onHome: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 animate-[resultsUp_0.28s_cubic-bezier(0.16,1,0.3,1)] rounded-t-3xl border-t border-border-strong bg-surface/95 px-6 pb-10 pt-7 backdrop-blur-md">
      <style>{`@keyframes resultsUp { from { transform: translateY(100%);} to { transform: translateY(0);} }`}</style>
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
        ▲ caught by the lava
      </p>
      <h2 className="mt-2 text-center font-mono text-6xl font-bold leading-none tabular-nums text-signal">
        {peakY.toFixed(0)}
        <span className="ml-1 text-2xl font-normal text-text-muted">
          {ALTITUDE_UNIT}
        </span>
      </h2>
      <p className="mt-1 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
        {saveInfo?.saved && saveInfo.rank
          ? `#${saveInfo.rank}${saveInfo.totalClimbers ? ` of ${saveInfo.totalClimbers}` : ""}${saveInfo.improved ? " · new best" : ""}`
          : "your highest climb"}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={onPlayAgain}
          className="rounded-full bg-signal py-4 font-display text-base font-black uppercase tracking-widest text-void transition-transform active:scale-95"
        >
          Play again
        </button>
        <div className="flex gap-3">
          {shareable && (
            <button
              onClick={onShare}
              className="flex-1 rounded-full border border-border-strong bg-surface-raised py-3.5 font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform active:scale-95"
            >
              Share
            </button>
          )}
          <button
            onClick={onHome}
            className="flex-1 rounded-full border border-border-strong bg-surface-raised py-3.5 font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform active:scale-95"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
