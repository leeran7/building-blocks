"use client";

/**
 * Tower v3 "The Climb" — multiplayer 1v1 driver hook.
 *
 * Mirrors useClimb.ts's fixed-timestep rAF loop but gates each tick on the
 * remote input buffer (delay-based deterministic lockstep). INPUT_DELAY
 * ticks of latency are added to every input publication so the peer's buffer
 * is pre-filled before we consume those ticks.
 *
 * Phase order:
 *   lobby → (start() called on receiving "start" event) → countdown → climb
 *     → finished/results
 *
 * Stall detection: if the remote buffer is empty for STALL_WARN_TICKS we
 * surface stalling=true; at STALL_FORFEIT_TICKS we auto-forfeit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MatchState,
  PlayerInput,
  TowerSpec,
  TICK_DT,
  NO_INPUT,
} from "./types";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "./simulation";
import { applyRunSeed } from "./towers";
import { RealtimeHandle } from "../net/realtime";
import { TouchInput, NO_TOUCH } from "./useClimb";
import { packInputLog } from "./runReplay";
import { auth } from "../lib/firebase";

/** How many ticks ahead we tag published inputs (133 ms at 30 Hz). */
const INPUT_DELAY = 4;

/** Show "syncing…" after this many stall ticks (1 s). */
const STALL_WARN_TICKS = 30;

/** Auto-forfeit after this many stall ticks (3 s). */
const STALL_FORFEIT_TICKS = 90;

const TICK_DT_MS = TICK_DT * 1000;

/** Default key bindings — same as useClimb. */
const KEY_LEFT = new Set(["ArrowLeft", "a", "A"]);
const KEY_RIGHT = new Set(["ArrowRight", "d", "D"]);
const KEY_UP = new Set(["ArrowUp", "w", "W"]);
const KEY_DOWN = new Set(["ArrowDown", "s", "S"]);
const KEY_JUMP = new Set([" ", "Spacebar"]);

export interface DuelResult {
  winnerId: string | null;
  tiebreakRule: string | null;
  player1Peak: number | null;
  player2Peak: number | null;
  forfeit: boolean;
}

export interface UseDuelOptions {
  tower: TowerSpec;
  seed: string;
  myId: string;
  opponentId: string;
  mySlot: 0 | 1;
  realtime: RealtimeHandle;
  duelId: string;
}

export interface UseDuelResult {
  state: MatchState;
  myId: string;
  /** Start the countdown (call after "start" event received). */
  start: () => void;
  finished: boolean;
  stalling: boolean;
  setTouch: (t: TouchInput) => void;
  duelResult: DuelResult | null;
  forfeit: () => void;
  /** Opponent abandoned — resolve the local player as the winner. */
  opponentForfeited: () => void;
  /** True when every result-submit attempt failed (offer a manual retry). */
  resultError: boolean;
  /** Re-attempt a failed result submission. */
  retrySubmit: () => void;
}

function hasAny(set: Set<string>, keys: Set<string>): boolean {
  for (const k of keys) if (set.has(k)) return true;
  return false;
}

async function getFirebaseToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export function useDuel({
  tower,
  seed,
  myId,
  opponentId,
  mySlot,
  realtime,
  duelId,
}: UseDuelOptions): UseDuelResult {
  const playerIds = mySlot === 0 ? [myId, opponentId] : [opponentId, myId];

  const makeMatch = useCallback(() => {
    const seededTower = applyRunSeed(tower, seed);
    const m = createMatch({
      seed,
      mode: "multiplayer",
      tower: seededTower,
      playerIds,
    });
    m.phase = "lobby";
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tower, seed, myId, opponentId]);

  const [state, setState] = useState<MatchState>(() => makeMatch());
  const stateRef = useRef(state);
  stateRef.current = state;

  const [stalling, setStalling] = useState(false);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  /** True when every result-submit attempt failed; the UI offers a manual retry. */
  const [resultError, setResultError] = useState(false);

  // Input buffers
  const remoteBuffer = useRef(new Map<number, PlayerInput>());
  const localInputLog = useRef<PlayerInput[]>([]);
  const stallTicksRef = useRef(0);

  // Loop state
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<TouchInput>(NO_TOUCH);
  const runningRef = useRef(false);
  const accumulatorRef = useRef(0);
  const lastTsRef = useRef(0);
  const resultSubmittedRef = useRef(false);
  const forfeitedRef = useRef(false);
  const lastOutcomeRef = useRef<"win" | "loss" | "forfeit" | null>(null);

  // Keyboard listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const cur = stateRef.current;
      if (cur.phase !== "countdown" && cur.phase !== "climb") return;
      const target = e.target;
      if (target instanceof Element && target.closest("button,a[href],input,select,textarea")) return;
      const isGameKey =
        KEY_LEFT.has(e.key) ||
        KEY_RIGHT.has(e.key) ||
        KEY_UP.has(e.key) ||
        KEY_DOWN.has(e.key) ||
        KEY_JUMP.has(e.key);
      if (!isGameKey) return;
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

  const sampleInput = useCallback((): PlayerInput => {
    const keys = keysRef.current;
    const t = touchRef.current;
    const left = t.left || hasAny(keys, KEY_LEFT);
    const right = t.right || hasAny(keys, KEY_RIGHT);
    const upKey = t.up || hasAny(keys, KEY_UP);
    const downKey = t.down || hasAny(keys, KEY_DOWN);
    const jump = t.jump || hasAny(keys, KEY_JUMP);

    const moveX: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;
    const climbY: -1 | 0 | 1 = upKey && !downKey ? 1 : downKey && !upKey ? -1 : 0;
    return { moveX, jump, climbY, usePowerUp: false };
  }, []);

  const submitResult = useCallback(
    async (claimedOutcome: "win" | "loss" | "forfeit") => {
      if (resultSubmittedRef.current) return;
      resultSubmittedRef.current = true;
      lastOutcomeRef.current = claimedOutcome;

      const packed = packInputLog(localInputLog.current);
      // Convert to base64 for JSON transport
      const base64 = btoa(String.fromCharCode(...packed));
      const token = await getFirebaseToken();
      const body = JSON.stringify({ seed, inputLog: base64, claimedOutcome });

      // A dropped result submission leaves the duel stuck "active" forever, so
      // retry with backoff and a per-attempt timeout. 202 (pending — opponent
      // not in yet), 200 (completed) and most 4xx are terminal; only network
      // errors / timeouts / 5xx are worth retrying.
      const delays = [0, 750, 2000, 4000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          const res = await fetch(`/api/duel/${duelId}/result`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          // Retry only on transient server errors; any other status is terminal.
          if (res.status >= 500) continue;
          setResultError(false);
          return;
        } catch {
          clearTimeout(timer);
          // Network error / timeout — fall through to the next attempt.
        }
      }
      // All attempts failed — let the UI offer a manual retry.
      resultSubmittedRef.current = false;
      setResultError(true);
    },
    [duelId, seed]
  );

  const forfeit = useCallback(() => {
    if (forfeitedRef.current) return;
    forfeitedRef.current = true;
    runningRef.current = false;

    realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "stall" });
    submitResult("forfeit");

    const cur = stateRef.current;
    const player0 = cur.players[0];
    const player1 = cur.players[1];

    setDuelResult({
      winnerId: mySlot === 0 ? opponentId : myId,
      tiebreakRule: null,
      player1Peak: player0?.peakY ?? null,
      player2Peak: player1?.peakY ?? null,
      forfeit: true,
    });

    setState((prev) => ({ ...prev, phase: "finished", winnerId: mySlot === 0 ? opponentId : myId }));
  }, [mySlot, myId, opponentId, realtime, submitResult]);

  /**
   * The opponent left (presence leave / explicit forfeit event) — the LOCAL
   * player wins. Distinct from forfeit(), which makes the local player lose.
   *
   * Server resolution is driven by the LEAVER's forfeit submission (sent via
   * sendBeacon on unload, so it survives a tab close). Here we (a) show the win
   * immediately so the remaining player is never stuck, and (b) submit our own
   * replay so our peak/participation is stored; it waits pending until the
   * leaver's forfeit voids the duel and records the win.
   */
  const opponentForfeited = useCallback(() => {
    if (forfeitedRef.current) return;
    forfeitedRef.current = true;
    runningRef.current = false;

    submitResult("win");

    const cur = stateRef.current;
    setDuelResult({
      winnerId: myId,
      tiebreakRule: null,
      player1Peak: cur.players[0]?.peakY ?? null,
      player2Peak: cur.players[1]?.peakY ?? null,
      forfeit: true,
    });
    setState((prev) => ({ ...prev, phase: "finished", winnerId: myId }));
  }, [myId, submitResult]);

  /** Re-attempt a failed result submission (wired to a UI retry button). */
  const retrySubmit = useCallback(() => {
    if (lastOutcomeRef.current) {
      setResultError(false);
      submitResult(lastOutcomeRef.current);
    }
  }, [submitResult]);

  // Subscribe to remote input
  useEffect(() => {
    const unsub = realtime.onInput((msg) => {
      remoteBuffer.current.set(msg.tick, msg.input);
    });
    return unsub;
  }, [realtime]);

  // Fixed-timestep rAF loop
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!runningRef.current) return;

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.25) dt = 0.25;
      accumulatorRef.current += dt * 1000; // keep in ms for clarity

      let cur = stateRef.current;
      let advanced = false;

      while (accumulatorRef.current >= TICK_DT_MS) {
        accumulatorRef.current -= TICK_DT_MS;

        const currentTick = cur.tick;
        const localInput = sampleInput();

        if (cur.phase === "countdown") {
          // Advance without gating on remote buffer
          cur = stepMatch(cur, {}, DEFAULT_SIM_CONFIG);
          // Publish my delayed input
          realtime.publishInput(currentTick + INPUT_DELAY, localInput);
          // Do NOT push to localInputLog during countdown — the server re-sim
          // drains its own 90-tick countdown unconditionally then reads from
          // index 0 as climb-tick 0. Pushing here would shift every climb
          // input by 90 positions and break determinism.
          advanced = true;
        } else if (cur.phase === "climb") {
          // Gate on remote input buffer
          const remoteInput = remoteBuffer.current.get(currentTick);
          if (remoteInput !== undefined) {
            remoteBuffer.current.delete(currentTick);
            stallTicksRef.current = 0;

            const inputMap: Record<string, PlayerInput> = {};
            inputMap[myId] = localInput;
            inputMap[opponentId] = remoteInput;

            cur = stepMatch(cur, inputMap, DEFAULT_SIM_CONFIG);

            // Publish local input for a future tick
            realtime.publishInput(currentTick + INPUT_DELAY, localInput);
            localInputLog.current.push(localInput);

            advanced = true;
          } else {
            // Remote input not yet available — stall
            stallTicksRef.current++;
            if (stallTicksRef.current >= STALL_FORFEIT_TICKS) {
              forfeit();
              break;
            }
          }
        }

        if (cur.phase === "finished" || cur.phase === "results") {
          runningRef.current = false;

          const player0 = cur.players[0];
          const player1 = cur.players[1];

          // Defensive guard: the sim invariant (slot tiebreak) should always
          // resolve a winner, so winnerId === null is unexpected. We do NOT
          // want to corrupt stats with a spurious "loss" for both players.
          // Log the anomaly and treat it as a loss only as a last resort so
          // the UI can still exit the match gracefully.
          if (cur.winnerId === null) {
            console.error(
              "useDuel: match finished with winnerId === null — sim invariant violated. " +
              "Stats submission will use 'loss' as a defensive fallback; investigate the simulation."
            );
          }
          const outcome =
            cur.winnerId === myId
              ? "win"
              : "loss"; // covers both opponent-won and the unexpected null case

          setDuelResult({
            winnerId: cur.winnerId,
            tiebreakRule: cur.tiebreakRule,
            player1Peak: player0?.peakY ?? null,
            player2Peak: player1?.peakY ?? null,
            forfeit: false,
          });

          submitResult(outcome);
          break;
        }
      }

      // Update stalling state (outside the tick loop to avoid excessive setState)
      const nowStalling = stallTicksRef.current >= STALL_WARN_TICKS;
      setStalling(nowStalling);

      if (advanced) {
        setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInput, realtime, myId, opponentId, forfeit, submitResult]);

  const start = useCallback(() => {
    const fresh = makeMatch();
    fresh.phase = "countdown";
    fresh.tick = 0;
    accumulatorRef.current = 0;
    lastTsRef.current = 0;
    localInputLog.current = [];
    stallTicksRef.current = 0;
    remoteBuffer.current.clear();
    resultSubmittedRef.current = false;
    forfeitedRef.current = false;
    stateRef.current = fresh;
    setState(fresh);
    runningRef.current = true;
  }, [makeMatch]);

  const setTouch = useCallback((tch: TouchInput) => {
    touchRef.current = tch;
  }, []);

  const finished =
    state.phase === "finished" ||
    state.phase === "results" ||
    duelResult !== null;

  return {
    state,
    myId,
    start,
    finished,
    stalling,
    setTouch,
    duelResult,
    forfeit,
    opponentForfeited,
    resultError,
    retrySubmit,
  };
}
