"use client";

/**
 * Client-only MediaRecorder export of a shared climb replay.
 * Separate sim + canvas from the viewer; never mutates viewer tick (AC-13).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickExportMime,
  type ExportMimeChoice,
} from "../../game/exportMime";
import {
  EXPORT_HIDDEN_PAUSE_MS,
  pauseExportRecorder,
  resumeExportRecorder,
  shouldEnterPausedHidden,
} from "../../game/exportVisibility";
import {
  createMatch,
  stepMatch,
  DEFAULT_SIM_CONFIG,
} from "../../game/simulation";
import { applyRunSeed } from "../../game/towers";
import { NO_INPUT, type TowerSpec } from "../../game/types";
import type { RunReplay } from "../../game/runReplay";
import { paintClimbFrame } from "./paintClimbFrame";

export type ReplayExportStatus =
  | { kind: "idle" }
  | { kind: "running"; percent: number }
  | { kind: "paused_hidden"; percent: number }
  | {
      kind: "success";
      label: "MP4" | "WebM";
      /** Retained export file — same bytes/name/type as download (AC-NS-7). */
      file: File;
    }
  | { kind: "error"; message: string };

const EXPORT_W = 720;
const EXPORT_H = 1280;
const EXPORT_FPS = 30;
const EXPORT_BITRATE = 2_500_000;
const PLAYER_ID = "you";
const FRAME_MS = 1000 / EXPORT_FPS;
/** Delay revoke so browsers finish the download click (AC-15). */
const BLOB_REVOKE_MS = 1000;
const UNSUPPORTED_MSG = "Video export isn’t supported in this browser";
const HIDDEN_UNSUPPORTED_MSG =
  "Video export can’t pause in the background in this browser";

export interface UseReplayExportArgs {
  replay: RunReplay | null | undefined;
  tower: TowerSpec;
  enabled: boolean;
}

export function useReplayExport({
  replay,
  tower,
  enabled,
}: UseReplayExportArgs): {
  status: ReplayExportStatus;
  startExport: () => void;
  cancelExport: () => void;
  dismissStatus: () => void;
} {
  const [status, setStatus] = useState<ReplayExportStatus>({ kind: "idle" });
  const sessionRef = useRef<ExportSession | null>(null);
  const announceSeq = useRef(0);

  const cancelExport = useCallback(() => {
    const s = sessionRef.current;
    if (!s) {
      setStatus({ kind: "idle" });
      return;
    }
    s.cancelled = true;
    try {
      if (s.recorder.state !== "inactive") s.recorder.stop();
    } catch {
      /* ignore */
    }
    cleanupSession(s);
    sessionRef.current = null;
    setStatus({ kind: "idle" });
  }, []);

  const dismissStatus = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const startExport = useCallback(() => {
    if (!enabled || !replay?.inputs.length) return;
    if (sessionRef.current) return; // AC-14 negative

    const mime = pickExportMime();
    if (!mime) {
      setStatus({
        kind: "error",
        message: UNSUPPORTED_MSG,
      });
      return;
    }

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    try {
      canvas = document.createElement("canvas");
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      const c = canvas.getContext("2d", { alpha: false });
      if (!c) throw new Error("2d context unavailable");
      ctx = c;
    } catch {
      setStatus({
        kind: "error",
        message: UNSUPPORTED_MSG,
      });
      return;
    }

    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setStatus({
        kind: "error",
        message: UNSUPPORTED_MSG,
      });
      return;
    }

    const stream = canvas.captureStream(EXPORT_FPS);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime.mimeType,
        videoBitsPerSecond: EXPORT_BITRATE,
      });
    } catch {
      setStatus({
        kind: "error",
        message: UNSUPPORTED_MSG,
      });
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const chunks: BlobPart[] = [];
    const peakMetres = Math.round(replay.peakY);
    const yyyyMMdd = utcDateStamp(new Date());
    const filename = `climb-${peakMetres}m-${yyyyMMdd}.${mime.extension}`;

    const session: ExportSession = {
      cancelled: false,
      recorder,
      stream,
      canvas,
      ctx,
      mime,
      filename,
      chunks,
      hiddenSince: null,
      raf: 0,
      timer: 0,
      lastProgressAt: 0,
    };
    sessionRef.current = session;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) session.chunks.push(ev.data);
    };
    recorder.onerror = () => {
      if (session.cancelled) return;
      failSession(session, sessionRef, setStatus, "Encode error");
    };
    recorder.onstop = () => {
      if (session.cancelled) {
        cleanupSession(session);
        if (sessionRef.current === session) sessionRef.current = null;
        return;
      }
      try {
        // Container MIME only on assembled File/Blob (ADR-NS-2) — never forge
        // video/mp4 for WebM, never pass codec-qualified strings to share.
        const containerType = containerMimeForLabel(session.mime.label);
        const blob = new Blob(session.chunks, { type: containerType });
        if (blob.size === 0) {
          failSession(session, sessionRef, setStatus, "Empty video");
          return;
        }
        const file = new File([blob], session.filename, { type: containerType });
        downloadBlob(file, session.filename);
        // Retain File past download URL revoke (~1s). Never auto-share here
        // (ADR-NS-1 / AC-NS-4 negative) — gesture lives in the transport bar.
        setStatus({
          kind: "success",
          label: session.mime.label,
          file,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Export failed";
        failSession(session, sessionRef, setStatus, msg);
        return;
      }
      cleanupSession(session);
      if (sessionRef.current === session) sessionRef.current = null;
    };

    setStatus({ kind: "running", percent: 0 });
    try {
      recorder.start(200);
    } catch {
      failSession(
        session,
        sessionRef,
        setStatus,
        UNSUPPORTED_MSG
      );
      return;
    }

    void runEncodeLoop(session, replay, tower, setStatus, sessionRef);
  }, [enabled, replay, tower]);

  // Visibility: pause encode + MediaRecorder when hidden ≥3s (AC-18 policy b).
  useEffect(() => {
    const onVis = () => {
      const s = sessionRef.current;
      if (!s) return;
      if (document.visibilityState === "hidden") {
        s.hiddenSince = performance.now();
        return;
      }
      s.hiddenSince = null;
      if (status.kind !== "paused_hidden") return;
      if (!resumeExportRecorder(s.recorder)) {
        failSession(s, sessionRef, setStatus, HIDDEN_UNSUPPORTED_MSG);
        return;
      }
      setStatus({ kind: "running", percent: status.percent });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      if (!s) return;
      s.cancelled = true;
      try {
        if (s.recorder.state !== "inactive") s.recorder.stop();
      } catch {
        /* ignore */
      }
      cleanupSession(s);
      sessionRef.current = null;
    };
  }, []);

  // Silence unused — seq reserved for future a11y coupling from bar.
  void announceSeq;

  return { status, startExport, cancelExport, dismissStatus };
}

type ExportSession = {
  cancelled: boolean;
  recorder: MediaRecorder;
  stream: MediaStream;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mime: ExportMimeChoice;
  filename: string;
  chunks: BlobPart[];
  hiddenSince: number | null;
  raf: number;
  timer: number;
  lastProgressAt: number;
};

async function runEncodeLoop(
  session: ExportSession,
  replay: RunReplay,
  tower: TowerSpec,
  setStatus: (s: ReplayExportStatus) => void,
  sessionRef: { current: ExportSession | null }
): Promise<void> {
  const inputs = replay.inputs;
  const n = inputs.length;
  const seeded = applyRunSeed(tower, replay.seed);
  const state = createMatch({
    seed: replay.seed,
    mode: "solo",
    tower: seeded,
    playerIds: [PLAYER_ID],
  });

  // Drain countdown without capturing frames (ADR-2).
  let guard = 200;
  while (state.phase === "countdown" && guard-- > 0) {
    stepMatch(state, {}, DEFAULT_SIM_CONFIG);
  }

  const camera = { y: null as number | null, tick: null as number | null };
  let framesDone = 0;
  let lastPaintWall = 0;

  const paintAndAdvance = (): boolean => {
    if (session.cancelled) return false;

    if (document.visibilityState === "hidden") {
      if (session.hiddenSince === null) session.hiddenSince = performance.now();
      if (
        shouldEnterPausedHidden(
          session.hiddenSince,
          performance.now(),
          EXPORT_HIDDEN_PAUSE_MS
        )
      ) {
        if (!pauseExportRecorder(session.recorder)) {
          failSession(
            session,
            sessionRef,
            setStatus,
            HIDDEN_UNSUPPORTED_MSG
          );
          return false;
        }
        setStatus({
          kind: "paused_hidden",
          percent: exportPercent(framesDone, n),
        });
        return true;
      }
    } else {
      session.hiddenSince = null;
    }

    const now = performance.now();
    if (lastPaintWall > 0 && now - lastPaintWall < FRAME_MS * 0.85) {
      return true;
    }
    lastPaintWall = now;

    // Encode climb ticks 0…N−1: paint current state, then step (AC-13 / ADR-2).
    if (framesDone >= n) {
      try {
        if (session.recorder.state === "recording") session.recorder.stop();
      } catch {
        failSession(session, sessionRef, setStatus, "Encode error");
      }
      return false;
    }

    paintClimbFrame(session.ctx, state, {
      width: EXPORT_W,
      height: EXPORT_H,
      reducedMotion: true,
      bottomInset: 0,
      hudInsetTop: 0,
      includeHud: true,
      camera,
    });

    const pct = exportPercent(framesDone, n);
    if (framesDone % 15 === 0 || now - session.lastProgressAt >= 250) {
      session.lastProgressAt = now;
      setStatus({ kind: "running", percent: pct });
    }

    const tickIndex = state.phase === "climb" ? state.tick : framesDone;
    const input = inputs[tickIndex] ?? NO_INPUT;
    stepMatch(state, { [PLAYER_ID]: input }, DEFAULT_SIM_CONFIG);
    framesDone += 1;

    if (state.phase === "finished" || state.phase === "results") {
      // Paint terminal frame already counted; finish encode.
      try {
        if (session.recorder.state === "recording") session.recorder.stop();
      } catch {
        failSession(session, sessionRef, setStatus, "Encode error");
      }
      return false;
    }

    return true;
  };

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (session.cancelled || sessionRef.current !== session) {
        resolve();
        return;
      }
      const cont = paintAndAdvance();
      if (!cont) {
        resolve();
        return;
      }
      session.raf = requestAnimationFrame(tick);
    };
    session.raf = requestAnimationFrame(tick);
  });
}

function exportPercent(climbTick: number, n: number): number {
  const den = Math.max(1, n - 1);
  return Math.min(100, Math.floor((100 * climbTick) / den));
}

function failSession(
  session: ExportSession,
  sessionRef: { current: ExportSession | null },
  setStatus: (s: ReplayExportStatus) => void,
  message: string
): void {
  session.cancelled = true;
  try {
    if (session.recorder.state !== "inactive") session.recorder.stop();
  } catch {
    /* ignore */
  }
  cleanupSession(session);
  if (sessionRef.current === session) sessionRef.current = null;
  setStatus({ kind: "error", message });
}

function cleanupSession(session: ExportSession): void {
  if (session.raf) cancelAnimationFrame(session.raf);
  if (session.timer) clearTimeout(session.timer);
  session.stream.getTracks().forEach((t) => t.stop());
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers cancel the download if the blob URL is revoked synchronously.
  // Share retention uses status.file (independent of this revoke — AC-NS-7).
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, BLOB_REVOKE_MS);
}

/** Container MIME for download + share File.type (ADR-NS-2 / AC-NS-8). */
function containerMimeForLabel(label: "MP4" | "WebM"): "video/mp4" | "video/webm" {
  return label === "MP4" ? "video/mp4" : "video/webm";
}

function utcDateStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
