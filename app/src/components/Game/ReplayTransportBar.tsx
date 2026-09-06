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
  commitScrubRatio,
  cycleReplaySpeed,
  formatReplayClock,
  REWIND_REPEAT_MS,
} from "../../game/replayTransport";
import { exportSuccessLabel } from "../../game/exportDelivery";
import {
  canShareVideoFile,
  shareVideoFile,
} from "../../game/shareVideoFile";
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
  /** Draft seek ratio while pointer is down; null = track live climbTick. */
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const prevExportKind = useRef(exportStatus.kind);
  /** Bar-local share failure — must not replace status.kind === success. */
  const [shareError, setShareError] = useState<string | null>(null);

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
    if (exportStatus.kind !== "success") {
      setShareError(null);
    }
  }, [exportStatus.kind]);

  useEffect(() => {
    const prev = prevExportKind.current;
    prevExportKind.current = exportStatus.kind;
    if (exportStatus.kind === prev) return;
    if (exportStatus.kind === "running") {
      speak("Export started");
    } else if (exportStatus.kind === "success") {
      const canShare = canShareVideoFile(exportStatus.file);
      speak(
        exportSuccessLabel(
          exportStatus.label,
          exportStatus.delivery,
          canShare
        )
      );
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

  const liveRatio =
    transport.totalTicks <= 1
      ? 0
      : transport.climbTick / Math.max(1, transport.totalTicks - 1);
  const displayRatio =
    scrubRatio !== null
      ? scrubRatio
      : Number.isFinite(liveRatio)
        ? liveRatio
        : 0;

  const commitScrub = (ratio: number) => {
    onSeek(commitScrubRatio(ratio, transport.totalTicks));
    setScrubRatio(null);
  };

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
            value={displayRatio}
            aria-label="Seek replay"
            aria-valuetext={`${formatReplayClock(transport.climbTick)} of ${formatReplayClock(transport.totalTicks)}`}
            className="h-11 w-full min-h-[44px] accent-signal cursor-pointer"
            onPointerDown={() => {
              setScrubRatio(Number.isFinite(liveRatio) ? liveRatio : 0);
            }}
            onPointerUp={(e) => {
              // Prefer the input's live value — React state can lag the last drag frame.
              commitScrub(Number((e.target as HTMLInputElement).value));
            }}
            onPointerCancel={(e) => {
              commitScrub(Number((e.target as HTMLInputElement).value));
            }}
            onChange={(e) => {
              const r = Number(e.target.value);
              if (scrubRatio !== null) {
                setScrubRatio(r);
                return;
              }
              onSeek(commitScrubRatio(r, transport.totalTicks));
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
                {exportSuccessLabel(
                  exportStatus.label,
                  exportStatus.delivery,
                  canShareVideoFile(exportStatus.file)
                )}
              </p>
              <div className="flex items-center gap-1">
                {canShareVideoFile(exportStatus.file) ? (
                  <button
                    type="button"
                    aria-label="Share"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2 font-mono text-[10px] uppercase tracking-wider text-text-primary hover:bg-signal/10"
                    onClick={async () => {
                      // Start share in this activation — no unrelated awaits first
                      // (ADR-NS-5 / NFR-NS-2).
                      const file = exportStatus.file;
                      setShareError(null);
                      const result = await shareVideoFile(file, {
                        title: file.name,
                      });
                      if (result.ok) {
                        speak("Share complete");
                        return;
                      }
                      if (result.reason === "aborted") {
                        // Quiet cancel — keep success + Share (AC-NS-5).
                        return;
                      }
                      if (result.reason === "error") {
                        setShareError(result.message);
                      }
                    }}
                  >
                    Share
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-[44px] px-2 font-mono text-[10px] uppercase text-text-muted hover:text-text-primary"
                  onClick={() => {
                    setShareError(null);
                    onDismissExportStatus();
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
            {shareError ? (
              <p
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-ember"
                role="alert"
              >
                {shareError}
              </p>
            ) : null}
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
