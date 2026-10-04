"use client";

/**
 * React side of the emote stage: a provider that owns the one canvas for a
 * layer, and `EmoteView`, a box the stage draws a prop into.
 *
 * The stage (and three.js with it) is loaded on demand the first time a
 * provider mounts, so the duel room's first paint does not wait on it. Until
 * it is ready, or when WebGL is unavailable or lost, a view shows the
 * catalog glyph instead, so the feature degrades to the emoji it replaced
 * rather than to a hole.
 */

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { EmoteProp } from "../../../net/emotes";
import type { EmoteStage, ViewSide } from "./emoteStage";

interface StageContextValue {
  stage: EmoteStage | null;
  /** True after the loader settled, whichever way. */
  settled: boolean;
}

const StageContext = createContext<StageContextValue>({ stage: null, settled: false });

/** Loads the stage module once per page. */
let stageModule: Promise<typeof import("./emoteStage")> | null = null;
function loadStage() {
  if (!stageModule) {
    stageModule = import("./emoteStage").catch((err) => {
      stageModule = null;
      throw err;
    });
  }
  return stageModule;
}

export interface EmoteStageProviderProps {
  /** The element the canvas covers; views anywhere inside it are drawn. */
  host: RefObject<HTMLElement | null>;
  /** Class for the canvas (positioning lives in the caller's stylesheet). */
  canvasClassName?: string;
  children: ReactNode;
}

export function EmoteStageProvider({ host, canvasClassName, children }: EmoteStageProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState<StageContextValue>({ stage: null, settled: false });

  useEffect(() => {
    let cancelled = false;
    let stage: EmoteStage | null = null;
    loadStage()
      .then((m) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const hostEl = host.current;
        stage = canvas && hostEl ? m.createEmoteStage(canvas, hostEl) : null;
        setValue({ stage, settled: true });
      })
      .catch(() => {
        if (!cancelled) setValue({ stage: null, settled: true });
      });
    return () => {
      cancelled = true;
      stage?.dispose();
    };
  }, [host]);

  return (
    <StageContext.Provider value={value}>
      <canvas ref={canvasRef} className={canvasClassName} aria-hidden="true" />
      {children}
    </StageContext.Provider>
  );
}

export interface EmoteViewProps {
  prop: EmoteProp;
  side: ViewSide;
  /** Fallback glyph when the stage is unavailable. */
  glyph: string;
  /** When set, the prop pops away over the last 350 ms of this window. */
  durationMs?: number;
  /** Hold a settled pose instead of animating. */
  still?: boolean;
  className?: string;
}

/**
 * A box the stage renders `prop` into. The age is counted from mount; a
 * change of `prop` restarts it (give the element a `key` to restart on a
 * repeat of the same prop).
 */
export function EmoteView({ prop, side, glyph, durationMs, still, className }: EmoteViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { stage, settled } = useContext(StageContext);
  const startedAt = useRef<number | null>(null);
  if (startedAt.current === null) startedAt.current = performance.now();
  const [lost, setLost] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!stage || !el || stage.lost) return;
    const handle = stage.add({ el, prop, side, startedAt: startedAt.current ?? performance.now(), durationMs, still });
    // Poll for a lost context so the glyph can take over mid-bubble.
    const check = setInterval(() => {
      if (stage.lost) setLost(true);
    }, 500);
    return () => {
      clearInterval(check);
      handle.remove();
    };
  }, [stage, prop, side, durationMs, still]);

  const showGlyph = settled && (stage === null || stage.lost || lost);
  return (
    <div ref={ref} className={className} data-emote-prop={prop} data-fallback={showGlyph || undefined} aria-hidden="true">
      {showGlyph ? glyph : null}
    </div>
  );
}
