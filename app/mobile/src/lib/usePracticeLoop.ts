import { useCallback, useEffect, useRef, useState } from "react";

import { fillClimbInput, isInteractiveTarget, NO_TOUCH, shouldCaptureGameKey, type TouchInput } from "@app/game/useClimb";
import { emptySample, sampleInterp, type RenderFrame } from "@app/game/renderFeed";
import { TICK_DT, type MatchState, type PlayerInput } from "@app/game/types";

/**
 * A climb the player drives off the record: the tutorial's training, or the
 * level intro's try-the-controls window. `state` may be swapped for a fresh
 * match between ticks (the controls practice starts over that way).
 */
export interface PracticeSim {
  readonly state: MatchState;
  /** Training's goal on screen; a free practice has none. */
  readonly goalIndex?: number;
  /** The climb is over: stop stepping. */
  readonly done?: boolean;
  step(input: PlayerInput): void;
}

/** React's view of the practice: refreshed every few ticks and on every goal or match change. */
export interface PracticeView {
  state: MatchState;
  goalIndex: number;
  done: boolean;
  tick: number;
}

/** Ticks between React snapshots (~10 Hz), as in useClimb. */
const VIEW_EVERY_TICKS = 3;

/**
 * Steps a practice climb at the engine's tick rate from the touch controls
 * (and the keyboard, unless `keyboard` is false), and hands the canvas each
 * tick through a render feed. While `active` is false the climb holds still.
 */
export function usePracticeLoop(
  sim: PracticeSim,
  { active = true, keyboard = true }: { active?: boolean; keyboard?: boolean } = {},
) {
  const snapshot = (): PracticeView => ({
    state: sim.state,
    goalIndex: sim.goalIndex ?? 0,
    done: sim.done ?? false,
    tick: sim.state.tick,
  });
  const [view, setView] = useState<PracticeView>(snapshot);
  const feed = useRef<RenderFrame | null>(null);
  const touchRef = useRef<TouchInput>(NO_TOUCH);
  const keysRef = useRef<Set<string>>(new Set());
  const setTouch = useCallback((t: TouchInput) => {
    touchRef.current = t;
  }, []);

  useEffect(() => {
    if (!keyboard) return;
    const down = (e: KeyboardEvent) => {
      if (!shouldCaptureGameKey(e.key, sim.state.phase, isInteractiveTarget(e.target))) return;
      e.preventDefault();
      keysRef.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const clear = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [sim, keyboard]);

  useEffect(() => {
    if (!active) return;
    const frame: RenderFrame = { state: sim.state, prev: null, stepTs: 0 };
    let prev = emptySample();
    const input: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
    feed.current = frame;
    let raf = 0;
    let lastTs = 0;
    let acc = 0;
    let sinceView = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (sim.done) return;
      if (lastTs === 0) lastTs = ts;
      acc += Math.min(0.25, (ts - lastTs) / 1000);
      lastTs = ts;
      let advanced = false;
      let changed = false;
      while (acc >= TICK_DT && !sim.done) {
        acc -= TICK_DT;
        const state = sim.state;
        sampleInterp(state, prev);
        const goal = sim.goalIndex;
        sim.step(fillClimbInput(input, keysRef.current, touchRef.current));
        if (sim.state !== state) {
          // A fresh match: nothing to tween from.
          prev = emptySample();
          frame.state = sim.state;
          changed = true;
        }
        changed ||= sim.goalIndex !== goal;
        advanced = true;
        sinceView += 1;
      }
      if (!advanced) return;
      frame.prev = prev.x.length > 0 ? prev : null;
      frame.stepTs = ts - acc * 1000;
      if (changed || sim.done || sinceView >= VIEW_EVERY_TICKS) {
        sinceView = 0;
        setView(snapshot());
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // snapshot only reads `sim`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, active]);

  return { view, feed, setTouch };
}
