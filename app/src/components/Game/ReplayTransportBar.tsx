"use client";

/**
 * ASCENT transport chrome for shared replays: pause/play, rewind, speed,
 * seek, and export. 44×44 targets; mono instrument labels (DESIGN.md).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { ReplayTransportView } from "../../game/useClimb";
import {
  cycleReplaySpeed,
  formatReplayClock,
  REWIND_REPEAT_MS,
  tickFromSeekRatio,
} from "../../game/replayTransport";
import type { ReplayExportStatus } from "./useReplayExport";

export interface ReplayTransportBarProps {
  transport: ReplayTransportView;
  finished: boolean;
  onTogglePlayPause: () => void;
  onRewind: () => void;
  onCycleSpeed: () => void;
  onSeek: (tick: number) => void;
  onExport: () => void;
  onCancelExport: () => void;
  onDismissExportStatus: () => void;
  exportStatus: ReplayExportStatus;
}

export function ReplayTransportBar({
  transport,
  finished,
  onTogglePlayPause,
  onRewind,
  onCycleSpeed,
  onSeek,
  onExport,
  onCancelExport,
  onDismissExportStatus,
  exportStatus,
}: ReplayTransportBarProps) {
  const liveId = useId();
  const [announce, setAnnounce] = useState("");
  const announceSeq = useRef(0);
  const rewindHoldRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubbing = useRef(false);

  const speak = useCallback((msg: string) => {
    announceSeq.current += 1;
    setAnnounce(`${msg} ${announceSeq.current}`);
  }, []);

  useEffect(() => {
    return () => {
      if (rewindHoldRef.current) clearInterval(rewindHoldRef.current);
    };
  }, []);

  useEffect(() => {
    if (exportStatus.kind === "success") {
      speak(`Downloaded ${exportStatus.label}`);
    } else if (exportStatus.kind === "error") {
      speak(exportStatus.message);
    } else if (exportStatus.kind === "paused_hidden") {
      speak("Return to this tab to finish exporting");
    }
  }, [exportStatus, speak]);

  const startRewindHold = () => {
    onRewind();
    if (rewindHoldRef.current) clearInterval(rewindHoldRef.current);
    rewindHoldRef.current = setInterval(() => {
      onRewind();
    }, REWIND_REPEAT_MS);
  };

  const stopRewindHold = () => {
    if (rewindHoldRef.current) {
      clearInterval(rewindHoldRef.current);
      rewindHoldRef.current = null;
    }
  };

  const ratio =
    transport.totalTicks <= 1
      ? 0
      : transport.climbTick / Math.max(1, transport.totalTicks - 1);

  const exporting =
    exportStatus.kind === "running" || exportStatus.kind === "paused_hidden";
  const pauseDisabled = finished;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 px-2 pb-[max(8px,env(safe-area-inset-bottom))]"
      data-climb-transport
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2 rounded-xl border border-border-strong/80 bg-void/85 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={Number.isFinite(ratio) ? ratio : 0}
            aria-label="Seek replay"
            aria-valuetext={`${formatReplayClock(transport.climbTick)} of ${formatReplayClock(transport.totalTicks)}`}
            className="h-11 w-full min-h-[44px] accent-signal cursor-pointer"
            onPointerDown={() => {
              scrubbing.current = true;
            }}
            onPointerUp={(e) => {
              scrubbing.current = false;
              const r = Number((e.target as HTMLInputElement).value);
              onSeek(tickFromSeekRatio(r, transport.totalTicks));
            }}
            onChange={(e) => {
              if (!scrubbing.current) {
                onSeek(
                  tickFromSeekRatio(Number(e.target.value), transport.totalTicks)
                );
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <TransportIconButton
              label={transport.paused || finished ? "Play" : "Pause"}
              pressed={!transport.paused && !finished}
              disabled={pauseDisabled}
              onClick={() => {
                onTogglePlayPause();
                speak(transport.paused ? "Playing" : "Paused");
              }}
            >
              {transport.paused || finished ? "▶" : "❚❚"}
            </TransportIconButton>

            <TransportIconButton
              label="Rewind five seconds"
              onPointerDown={(e) => {
                e.preventDefault();
                startRewindHold();
              }}
              onPointerUp={stopRewindHold}
              onPointerLeave={stopRewindHold}
              onClick={onRewind}
            >
              ↺
            </TransportIconButton>

            <TransportIconButton
              label={`Speed ${transport.speed}x`}
              onClick={() => {
                const next = cycleReplaySpeed(transport.speed);
                onCycleSpeed();
                speak(`Speed ${next}x`);
              }}
            >
              <span className="font-mono text-xs tabular-nums">
                {transport.speed}x
              </span>
            </TransportIconButton>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary tabular-nums">
            {formatReplayClock(transport.climbTick)}
            <span className="text-text-muted"> / </span>
            {formatReplayClock(transport.totalTicks)}
          </p>

          <TransportIconButton
            label="Export video"
            disabled={exporting}
            onClick={() => {
              onExport();
              speak("Export started");
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider">
              Export
            </span>
          </TransportIconButton>
        </div>

        {exporting ? (
          <div className="flex items-center gap-2" role="status">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle">
              <div
                className="h-full bg-signal transition-[width] duration-150"
                style={{
                  width: `${exportStatus.percent}%`,
                }}
              />
            </div>
            <span className="font-mono text-[10px] tabular-nums text-text-secondary">
              {exportStatus.percent}%
            </span>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] rounded-lg px-2 font-mono text-[10px] uppercase tracking-wider text-ember hover:bg-ember/10"
              onClick={onCancelExport}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {exportStatus.kind === "paused_hidden" ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
            Return to this tab to finish exporting
          </p>
        ) : null}

        {exportStatus.kind === "success" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
              Downloaded {exportStatus.label}
            </p>
            <button
              type="button"
              className="min-h-[44px] px-2 font-mono text-[10px] uppercase text-text-muted hover:text-text-primary"
              onClick={onDismissExportStatus}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {exportStatus.kind === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ember">
              {exportStatus.message}
            </p>
            <button
              type="button"
              className="min-h-[44px] px-2 font-mono text-[10px] uppercase text-text-muted hover:text-text-primary"
              onClick={onDismissExportStatus}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div id={liveId} className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function TransportIconButton({
  label,
  children,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  disabled,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border-strong/60 bg-surface/60 px-2 text-text-primary hover:border-signal/50 disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}
