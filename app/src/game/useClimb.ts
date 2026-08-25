"use client";

/**
 * Tower v3 "The Climb" — solo climb driver hook (Phase 1 MVP).
 *
 * Runs the deterministic simulation on the client for solo time-trial play
 * (spec-next.md Phase 1). Uses a FIXED-TIMESTEP accumulator decoupled from the
 * render loop: requestAnimationFrame drives wall-clock, but the sim only ever
 * advances in whole TICK_DT steps via stepMatch. This is the same fixed-tick
 * discipline the authoritative server uses, so the exact same simulation code
 * later powers client-side prediction in multiplayer — no rewrite.
 *
 * Input is sampled from keyboard + an injectable touch state, mapped to the
 * PlayerInput intent the sim consumes. Position is always derived by stepMatch,
 * never set directly (mirrors the server-authoritative rule, AC-18).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MatchState,
  PlayerInput,
  TowerSpec,
  TICK_DT,
  NO_INPUT,
} from "./types";
import { createMatch, stepMatch, SimConfig, DEFAULT_SIM_CONFIG } from "./simulation";
import { HazardConfig, DEFAULT_HAZARD_CONFIG } from "./hazard";

export interface TouchInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

export const NO_TOUCH: TouchInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
};

/** Default key bindings — remappable per AC-33 (map lives in one place). */
const KEY_LEFT = new Set(["ArrowLeft", "a", "A"]);
const KEY_RIGHT = new Set(["ArrowRight", "d", "D"]);
const KEY_UP = new Set(["ArrowUp", "w", "W"]);
const KEY_DOWN = new Set(["ArrowDown", "s", "S"]);
const KEY_JUMP = new Set([" ", "Spacebar"]);

export interface UseClimbResult {
  state: MatchState;
  /** Start / restart the run from countdown. */
  start: () => void;
  /** Whether the run has ended (finished/results). */
  finished: boolean;
  /** Update the touch input (called by on-screen controls). */
  setTouch: (t: TouchInput) => void;
}

export interface UseClimbOptions {
  tower: TowerSpec;
  seed?: string;
  hazard?: HazardConfig;
  /** Reduced-motion: still simulates identically, only render differs (AC-35). */
}

const PLAYER_ID = "you";

export function useClimb({
  tower,
  seed = "solo",
  hazard = DEFAULT_HAZARD_CONFIG,
}: UseClimbOptions): UseClimbResult {
  const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, hazard };

  const makeInitial = useCallback(() => {
    const m = createMatch({
      seed,
      mode: "solo",
      tower,
      playerIds: [PLAYER_ID],
    });
    // Idle in the lobby until the player presses Start; start() flips to
    // countdown. createMatch defaults to countdown for headless/server use.
    m.phase = "lobby";
    return m;
  }, [seed, tower]);

  const [state, setState] = useState<MatchState>(makeInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<TouchInput>(NO_TOUCH);
  const runningRef = useRef(false);
  const accumulatorRef = useRef(0);
  const lastTsRef = useRef(0);

  // Keyboard listeners (AC-33: keyboard-only play is fully supported).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isGameKey(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const sampleInput = useCallback((onLadder: boolean): PlayerInput => {
    const keys = keysRef.current;
    const t = touchRef.current;
    const left = t.left || hasAny(keys, KEY_LEFT);
    const right = t.right || hasAny(keys, KEY_RIGHT);
    const upKey = t.up || hasAny(keys, KEY_UP);
    const downKey = t.down || hasAny(keys, KEY_DOWN);
    const jump = t.jump || hasAny(keys, KEY_JUMP);

    const moveX: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    // Up/Down only mean "climb" on a ladder; otherwise Up doubles as nothing
    // here (jump is Space). This keeps the intent unambiguous.
    const climbY: -1 | 0 | 1 = onLadder
      ? upKey && !downKey
        ? 1
        : downKey && !upKey
        ? -1
        : 0
      : 0;

    return { moveX, jump, climbY, usePowerUp: false };
  }, []);

  // Fixed-timestep rAF loop.
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!runningRef.current) return;

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      // Clamp huge frame gaps (tab was backgrounded) to avoid a spiral.
      if (dt > 0.25) dt = 0.25;
      accumulatorRef.current += dt;

      let cur = stateRef.current;
      let advanced = false;
      while (accumulatorRef.current >= TICK_DT) {
        accumulatorRef.current -= TICK_DT;
        const onLadder = cur.players[0]?.onLadder ?? false;
        const input =
          cur.phase === "countdown" ? NO_INPUT : sampleInput(onLadder);
        cur = stepMatch(cur, { [PLAYER_ID]: input }, cfg);
        advanced = true;
        if (cur.phase === "finished" || cur.phase === "results") {
          runningRef.current = false;
          break;
        }
      }
      if (advanced) {
        // Shallow-clone so React re-renders with the new tick.
        setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // cfg/sampleInput are stable per tower/seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInput]);

  const start = useCallback(() => {
    const fresh = makeInitial();
    fresh.phase = "countdown"; // 3-2-1 then GO (inputs locked during countdown)
    fresh.tick = 0;
    // Put the solo climber on a ladder at the base so climb input works from the
    // first segment (MVP ladder-climb archetype); richer geometry comes later.
    fresh.players[0].onLadder = true;
    accumulatorRef.current = 0;
    lastTsRef.current = 0;
    stateRef.current = fresh;
    setState(fresh);
    runningRef.current = true;
  }, [makeInitial]);

  const setTouch = useCallback((tch: TouchInput) => {
    touchRef.current = tch;
  }, []);

  const finished = state.phase === "finished" || state.phase === "results";

  return { state, start, finished, setTouch };
}

function hasAny(set: Set<string>, keys: Set<string>): boolean {
  for (const k of keys) if (set.has(k)) return true;
  return false;
}

function isGameKey(key: string): boolean {
  return (
    KEY_LEFT.has(key) ||
    KEY_RIGHT.has(key) ||
    KEY_UP.has(key) ||
    KEY_DOWN.has(key) ||
    KEY_JUMP.has(key)
  );
}
