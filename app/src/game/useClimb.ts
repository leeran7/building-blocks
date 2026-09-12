"use client";

/**
 * Tower v3 "The Climb" — solo climb driver hook (Phase 1 MVP).
 *
 * Runs the deterministic simulation on the client for solo time-trial play
 * (spec-next.md Phase 1). Uses a FIXED-TIMESTEP accumulator decoupled from the
 * render loop: requestAnimationFrame drives wall-clock, but the sim only ever
 * advances in whole TICK_DT steps via stepMatch.
 *
 * When `replayInputs` is set, a gated transport layer adds pause/speed/seek
 * without touching the live-play hot path (NFR-8).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ReplaySnapshotCache } from "./replaySnapshots";
import {
  cycleReplaySpeed,
  rewindTargetTick,
  type ReplaySpeed,
  REPLAY_SPEEDS,
} from "./replayTransport";

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

export type ReplayPhaseLabel = "playing" | "paused" | "finished";

export interface ReplayTransportView {
  paused: boolean;
  speed: ReplaySpeed;
  climbTick: number;
  totalTicks: number;
  phaseLabel: ReplayPhaseLabel;
}

export interface UseClimbResult {
  state: MatchState;
  /**
   * Mutable ref holding the authoritative simulation state. Canvas renderers
   * should read from this via requestAnimationFrame for smooth 60 fps drawing,
   * rather than from React state (which updates at ~10 Hz).
   */
  simRef: { readonly current: MatchState };
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
  /**
   * Replay-only transport snapshot. Null when not replaying so live play pays
   * no per-frame transport React work (NFR-8).
   */
  transport: ReplayTransportView | null;
  pause: () => void;
  play: () => void;
  togglePlayPause: () => void;
  cycleSpeed: () => void;
  rewind: () => void;
  seekToTick: (tick: number) => void;
  restartReplay: () => void;
}

export interface UseClimbOptions {
  tower: TowerSpec;
  seed?: string;
  hazard?: HazardConfig;
  /** When set, the hook replays this input log instead of sampling controls. */
  replayInputs?: PlayerInput[];
  /** Auto-start on mount (used for shared replays). */
  autoStart?: boolean;
}

/**
 * React state is updated every REACT_UPDATE_INTERVAL simulation ticks (~10 Hz
 * at 30 Hz sim) instead of every tick. The authoritative simulation state lives
 * in a mutable ref for rAF-driven canvas rendering; React state is a periodic
 * immutable snapshot for HUD components. Phase transitions always flush
 * immediately.
 */
const REACT_UPDATE_INTERVAL = 3;

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
      });
      m.phase = phase;
      return m;
    },
    [tower]
  );

  const [view, setView] = useState(() => ({
    match: makeMatch(seedLock ?? "solo", "lobby"),
    runId: 0,
  }));
  const state = view.match;
  const runId = view.runId;
  // stateRef is the authoritative mutable simulation state. It is NOT synced
  // from React state on every render — the rAF loop mutates it directly via
  // stepMatch, and React only receives periodic immutable snapshots.
  const stateRef = useRef(state);

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
  // Mutable input object reused every tick to avoid per-frame allocations.
  // Cloned only when stored in the input log for replay.
  const mutableInputRef = useRef<PlayerInput>({ moveX: 0, jump: false, climbY: 0, usePowerUp: false });
  const replaying = Boolean(replayInputs?.length);

  // Replay transport refs — only read when replaying (NFR-8).
  const pausedRef = useRef(false);
  const speedRef = useRef<ReplaySpeed>(1);
  const seekReqRef = useRef<number | null>(null);
  const snapshotRef = useRef<ReplaySnapshotCache | null>(null);
  const [transportUi, setTransportUi] = useState<{
    paused: boolean;
    speed: ReplaySpeed;
  }>({ paused: false, speed: 1 });

  useEffect(() => {
    if (!replaying || !replayInputs?.length || !seedLock) {
      snapshotRef.current = null;
      return;
    }
    snapshotRef.current = new ReplaySnapshotCache({
      tower,
      seed: seedLock,
      inputs: replayInputs,
      cfg,
    });
    return () => {
      snapshotRef.current?.invalidate();
      snapshotRef.current = null;
    };
    // Rebuild only when the replay identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaying, seedLock, replayInputs, tower]);

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
  // During shared replay, skip live capture so Space/arrows are not
  // preventDefault'd twice (replay handler owns transport keys; AC-20).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (replayInputsRef.current?.length) return;
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
    const climbY: -1 | 0 | 1 =
      upKey && !downKey ? 1 : downKey && !upKey ? -1 : 0;

    // Reuse a single mutable object instead of allocating a new one every tick.
    const inp = mutableInputRef.current;
    inp.moveX = moveX;
    inp.jump = jump;
    inp.climbY = climbY;
    inp.usePowerUp = false;
    return inp;
  }, []);

  const inputForTick = useCallback(
    (phase: MatchState["phase"], tick: number): PlayerInput => {
      if (phase === "countdown") return NO_INPUT;
      const replay = replayInputsRef.current;
      if (replay?.length) return replay[tick] ?? NO_INPUT;
      return sampleInput();
    },
    [sampleInput]
  );

  const publishMatch = useCallback((cur: MatchState) => {
    stateRef.current = cur;
    setView((v) => ({
      ...v,
      match: { ...cur, players: cur.players.map((p) => ({ ...p })) },
    }));
  }, []);

  const applySeek = useCallback(
    (target: number) => {
      const cache = snapshotRef.current;
      if (!cache) return;
      const next = cache.seek(target);
      accumulatorRef.current = 0;
      lastTsRef.current = 0;
      // Preserve play/pause; resume rAF if playing and not finished.
      const finished =
        next.phase === "finished" || next.phase === "results";
      runningRef.current = !pausedRef.current && !finished;
      publishMatch(next);
    },
    [publishMatch]
  );

  // Fixed-timestep rAF loop.
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);

      // Replay seek requests are applied on the rAF thread.
      if (replayInputsRef.current?.length && seekReqRef.current !== null) {
        const t = seekReqRef.current;
        seekReqRef.current = null;
        applySeek(t);
      }

      if (!runningRef.current) return;

      // Pause gate — only while replaying (NFR-8: live never reads this).
      if (replayInputsRef.current?.length && pausedRef.current) {
        lastTsRef.current = ts;
        return;
      }

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.25) dt = 0.25;

      const speed = replayInputsRef.current?.length ? speedRef.current : 1;
      accumulatorRef.current += dt * speed;

      let cur = stateRef.current;
      let advanced = false;
      const prevPhase = cur.phase;
      while (accumulatorRef.current >= TICK_DT) {
        accumulatorRef.current -= TICK_DT;
        const input = inputForTick(cur.phase, cur.tick);
        // Only climb ticks are scored/replayed (simulation.ts: tick resets to 0
        // at the countdown→climb boundary, so inputLog[0] must be climb-tick 0).
        // Recording countdown ticks here would shift every real input forward
        // by the countdown length once replayed.
        if (!replayInputsRef.current?.length && cur.phase === "climb") {
          // Clone the mutable input for immutable storage in the replay log.
          inputLogRef.current.push({ ...input });
        }
        cur = stepMatch(cur, { [PLAYER_ID]: input }, cfg);
        advanced = true;
        if (cur.phase === "finished" || cur.phase === "results") {
          runningRef.current = false;
          break;
        }
      }
      if (advanced) {
        // Flush an immutable snapshot to React state every REACT_UPDATE_INTERVAL
        // ticks (~10 Hz) instead of every tick. Always flush on phase transitions
        // so lifecycle-dependent UI (countdown, finished) updates immediately.
        const phaseChanged = cur.phase !== prevPhase;
        if (phaseChanged || cur.tick % REACT_UPDATE_INTERVAL === 0) {
          setView((v) => ({
            ...v,
            match: { ...cur, players: cur.players.map((p) => ({ ...p })) },
          }));
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInput, applySeek, inputForTick]);

  const start = useCallback(() => {
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

  const bumpTransportUi = useCallback(() => {
    if (!replaying) return;
    setTransportUi({ paused: pausedRef.current, speed: speedRef.current });
  }, [replaying]);

  const pause = useCallback(() => {
    if (!replaying) return;
    if (finished) return;
    pausedRef.current = true;
    runningRef.current = false;
    bumpTransportUi();
  }, [replaying, finished, bumpTransportUi]);

  const play = useCallback(() => {
    if (!replaying) return;
    if (finished) return;
    pausedRef.current = false;
    runningRef.current = true;
    lastTsRef.current = 0;
    bumpTransportUi();
  }, [replaying, finished, bumpTransportUi]);

  const togglePlayPause = useCallback(() => {
    if (!replaying) return;
    if (finished) return;
    if (pausedRef.current) play();
    else pause();
  }, [replaying, finished, play, pause]);

  const cycleSpeed = useCallback(() => {
    if (!replaying) return;
    speedRef.current = cycleReplaySpeed(speedRef.current);
    bumpTransportUi();
  }, [replaying, bumpTransportUi]);

  const seekToTick = useCallback(
    (tick: number) => {
      if (!replaying) return;
      seekReqRef.current = tick;
      // Kick the loop if paused so seek still applies.
      if (!runningRef.current) {
        applySeek(tick);
        seekReqRef.current = null;
      }
    },
    [replaying, applySeek]
  );

  const rewind = useCallback(() => {
    if (!replaying) return;
    const climbTick = climbTickOf(stateRef.current);
    seekToTick(rewindTargetTick(climbTick));
  }, [replaying, seekToTick]);

  const restartReplay = useCallback(() => {
    if (!replaying) return;
    pausedRef.current = false;
    speedRef.current = REPLAY_SPEEDS[0];
    seekReqRef.current = null;
    bumpTransportUi();
    start();
  }, [replaying, bumpTransportUi, start]);

  const transport = useMemo((): ReplayTransportView | null => {
    if (!replaying || !replayInputs?.length) return null;
    const phaseLabel: ReplayPhaseLabel = finished
      ? "finished"
      : transportUi.paused
        ? "paused"
        : "playing";
    return {
      paused: transportUi.paused,
      speed: transportUi.speed,
      climbTick: climbTickOf(state),
      totalTicks: replayInputs.length,
      phaseLabel,
    };
  }, [replaying, replayInputs, finished, transportUi, state]);

  return {
    state,
    simRef: stateRef,
    start,
    finished,
    setTouch,
    runId,
    inputLog,
    replaying,
    transport,
    pause,
    play,
    togglePlayPause,
    cycleSpeed,
    rewind,
    seekToTick,
    restartReplay,
  };
}

function climbTickOf(state: MatchState): number {
  if (state.phase === "countdown") return 0;
  return state.tick;
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
 * asserted without dispatching a DOM event.
 * When `replaying` is true, always false — replay transport owns those keys.
 */
export function shouldCaptureGameKey(
  key: string,
  phase: MatchPhase,
  targetIsInteractive: boolean,
  replaying = false
): boolean {
  if (replaying) return false;
  if (!isGameKey(key)) return false;
  if (targetIsInteractive) return false;
  return PHASES_CONSUMING_INPUT.has(phase);
}

/**
 * True when the key press belongs to a control rather than to the game.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest("[data-climb-capture-keys]")) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

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

const PHASES_CONSUMING_INPUT: ReadonlySet<MatchPhase> = new Set<MatchPhase>([
  "countdown",
  "climb",
]);
