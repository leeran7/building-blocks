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
  MatchPhase,
  MatchState,
  PlayerInput,
  TowerSpec,
  TICK_DT,
  NO_INPUT,
} from "./types";
import { createMatch, stepMatch, SimConfig, DEFAULT_SIM_CONFIG } from "./simulation";
import { HazardConfig, DEFAULT_HAZARD_CONFIG } from "./hazard";
import { applyRunSeed } from "./towers";
import { newRunSeed } from "./rng";

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
  /**
   * Increments on every Start. The seed cannot serve as a run identity — a
   * replay locks it, so two runs share one seed — and consumers that carry
   * per-run state across renders (sound cues, announcements) need to know a
   * new run began.
   */
  runId: number;
  /** Per-tick inputs from the last finished live run (empty while playing). */
  inputLog: PlayerInput[];
  /** True when inputs are fed from a shared replay instead of live controls. */
  replaying: boolean;
}

export interface UseClimbOptions {
  tower: TowerSpec;
  seed?: string;
  hazard?: HazardConfig;
  /** Reduced-motion: still simulates identically, only render differs (AC-35). */
  /** When set, the hook replays this input log instead of sampling controls. */
  replayInputs?: PlayerInput[];
  /** Auto-start on mount (used for shared replays). */
  autoStart?: boolean;
}

const PLAYER_ID = "you";

export function useClimb({
  tower,
  seed: seedLock,
  hazard = DEFAULT_HAZARD_CONFIG,
  replayInputs,
  autoStart = false,
}: UseClimbOptions): UseClimbResult {
  const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, hazard };

  const makeMatch = useCallback(
    (runSeed: string, phase: MatchState["phase"]) => {
      const m = createMatch({
        seed: runSeed,
        mode: "solo",
        tower: applyRunSeed(tower, runSeed),
        playerIds: [PLAYER_ID],
        hazard,
      });
      m.phase = phase;
      return m;
    },
    [tower, hazard]
  );

  // Match and runId live in one state object so a Start can never render a
  // frame where they disagree. Feedback (sounds, live region) keys off runId;
  // if it updated a frame after the match, the new run would inherit the
  // previous run's last pickup and fire a spurious "ended" cue.
  const [view, setView] = useState(() => ({
    match: makeMatch(seedLock ?? "solo", "lobby"),
    runId: 0,
  }));
  const state = view.match;
  const runId = view.runId;
  const stateRef = useRef(state);
  stateRef.current = state;

  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<TouchInput>(NO_TOUCH);
  const runningRef = useRef(false);
  const accumulatorRef = useRef(0);
  const lastTsRef = useRef(0);
  const consumedLobbySeed = useRef(false);
  const replayInputsRef = useRef(replayInputs);
  replayInputsRef.current = replayInputs;
  const inputLogRef = useRef<PlayerInput[]>([]);
  const [inputLog, setInputLog] = useState<PlayerInput[]>([]);
  const replaying = Boolean(replayInputs?.length);

  // Roll a unique map after mount so SSR/hydration share a placeholder, then
  // the lobby (and every later Start) is a different layout.
  useEffect(() => {
    if (seedLock || replayInputsRef.current?.length) return;
    if (consumedLobbySeed.current) return;
    if (stateRef.current.phase !== "lobby") return;
    const fresh = makeMatch(newRunSeed(), "lobby");
    stateRef.current = fresh;
    setView((v) => ({ ...v, match: fresh }));
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard listeners (AC-33: keyboard-only play is fully supported).
  //
  // This is a window-level listener, so it sees every key press on the page,
  // and the game keys are Space and the arrows. Calling preventDefault on all
  // of them unconditionally broke the page around the canvas: Space stopped
  // activating any focused button (including the mute toggle beside the game)
  // and the arrows stopped scrolling. So it is scoped two ways — the phases
  // that actually consume input, and never over an interactive element.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        !shouldCaptureGameKey(
          e.key,
          stateRef.current.phase,
          isInteractiveTarget(e.target)
        )
      ) {
        return;
      }
      e.preventDefault();
      keysRef.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // A key held as the run ends would otherwise stay in the set, and the next
  // run would start already moving.
  useEffect(() => {
    if (!PHASES_CONSUMING_INPUT.has(state.phase)) keysRef.current.clear();
  }, [state.phase]);

  const sampleInput = useCallback((): PlayerInput => {
    const keys = keysRef.current;
    const t = touchRef.current;
    const left = t.left || hasAny(keys, KEY_LEFT);
    const right = t.right || hasAny(keys, KEY_RIGHT);
    const upKey = t.up || hasAny(keys, KEY_UP);
    const downKey = t.down || hasAny(keys, KEY_DOWN);
    const jump = t.jump || hasAny(keys, KEY_JUMP);

    const moveX: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    // Up/Down are the climb intent. They only DO anything when the player is on
    // (or reaching) a ladder — the sim decides whether to grab/climb — but we
    // always report the intent so the sim can attach the player to a ladder.
    const climbY: -1 | 0 | 1 =
      upKey && !downKey ? 1 : downKey && !upKey ? -1 : 0;

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
        const input = inputForTick(cur.phase, cur.tick);
        if (!replayInputsRef.current?.length) {
          inputLogRef.current.push(input);
        }
        cur = stepMatch(cur, { [PLAYER_ID]: input }, cfg);
        advanced = true;
        if (cur.phase === "finished" || cur.phase === "results") {
          runningRef.current = false;
          break;
        }
      }
      if (advanced) {
        // Shallow-clone so React re-renders with the new tick.
        setView((v) => ({
          ...v,
          match: { ...cur, players: cur.players.map((p) => ({ ...p })) },
        }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // cfg/sampleInput are stable per tower/seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInput]);

  const inputForTick = useCallback(
    (phase: MatchState["phase"], tick: number): PlayerInput => {
      if (phase === "countdown") return NO_INPUT;
      const replay = replayInputsRef.current;
      if (replay?.length) return replay[tick] ?? NO_INPUT;
      return sampleInput();
    },
    [sampleInput]
  );

  const start = useCallback(() => {
    // First Start keeps the lobby preview; every later Start rolls a new map.
    // Pass `seed` into the hook to lock one layout (replay).
    const runSeed = seedLock
      ? seedLock
      : replayInputsRef.current?.length
        ? stateRef.current.seed
        : consumedLobbySeed.current
          ? newRunSeed()
          : stateRef.current.seed;
    consumedLobbySeed.current = true;
    const fresh = makeMatch(runSeed, "countdown");
    fresh.tick = 0;
    accumulatorRef.current = 0;
    lastTsRef.current = 0;
    inputLogRef.current = [];
    setInputLog([]);
    stateRef.current = fresh;
    setView((v) => ({ match: fresh, runId: v.runId + 1 }));
    runningRef.current = true;
  }, [makeMatch, seedLock]);

  useEffect(() => {
    if (!autoStart || !replayInputsRef.current?.length) return;
    if (stateRef.current.phase !== "lobby") return;
    start();
  }, [autoStart, start]);

  const setTouch = useCallback((tch: TouchInput) => {
    touchRef.current = tch;
  }, []);

  const finished = state.phase === "finished" || state.phase === "results";

  useEffect(() => {
    if (!finished || replaying) return;
    setInputLog([...inputLogRef.current]);
  }, [finished, replaying]);

  return { state, start, finished, setTouch, runId, inputLog, replaying };
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

/**
 * Whether this keydown should be recorded as game input and have its default
 * action suppressed. Split from the listener so the scoping rules can be
 * asserted without dispatching a DOM event:
 *   - lobby/results leave Space and arrows alone (Start, mute, scroll)
 *   - a focused button/link/input owns the key even during a climb
 */
export function shouldCaptureGameKey(
  key: string,
  phase: MatchPhase,
  targetIsInteractive: boolean
): boolean {
  if (!isGameKey(key)) return false;
  if (targetIsInteractive) return false;
  return PHASES_CONSUMING_INPUT.has(phase);
}

/**
 * True when the key press belongs to a control rather than to the game.
 *
 * Exported so the behaviour is testable without a DOM event: the property that
 * matters is which elements are exempt, not how the listener is wired.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest("[data-climb-capture-keys]")) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

/**
 * Elements that consume Space or the arrow keys themselves. `a` without href is
 * excluded deliberately — it is not focusable and not activatable.
 */
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='textbox']",
  "[role='slider']",
  "[role='spinbutton']",
].join(",");

/** Phases where the game reads the keyboard and may suppress default actions. */
const PHASES_CONSUMING_INPUT: ReadonlySet<MatchPhase> = new Set<MatchPhase>([
  "countdown",
  "climb",
]);
