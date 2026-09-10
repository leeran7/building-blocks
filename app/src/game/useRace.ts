"use client";

/**
 * Tower v3 "The Climb" — multiplayer race driver hook (independent-sim netcode).
 *
 * Replaces the old delay-based lockstep (useDuel). Each client runs its OWN
 * climb at full speed and NEVER waits on a peer, so the match can never stall or
 * freeze. Peers are shown as interpolated "ghosts" from ~8 Hz position snapshots
 * and folded into the shared rising-lava hazard estimate. The authoritative
 * result comes from the server re-simulating every player's input log — the
 * local sim is display-only.
 *
 * Phase order: lobby → (start() on "start" event) → countdown → climb → finished.
 *
 * Scales from 1v1 to N players: the sim, renderer, and this hook are all
 * slot-indexed and iterate `participants`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MatchState,
  PlayerInput,
  PlayerState,
  TowerSpec,
  TICK_DT,
} from "./types";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "./simulation";
import { isPowerUpActive } from "./powerups";
import { applyRunSeed } from "./towers";
import { GhostStore } from "./ghosts";
import { RealtimeHandle } from "../net/realtime";
import { TouchInput, NO_TOUCH } from "./useClimb";
import { packAndEncodeInputLog } from "./runReplay";
import { auth } from "../lib/firebase";

const TICK_DT_MS = TICK_DT * 1000;

/** Publish the local player's snapshot this often (~15 Hz at 30 Hz sim). */
const SNAPSHOT_EVERY_TICKS = 2;

/** No peer snapshot for this long mid-race → surface the opponent as "dropped". */
const OPPONENT_STALE_MS = 2500;

/** Where the currently-shown result came from. */
export type ResultSource = "provisional" | "authoritative" | null;

/** Default key bindings — same as useClimb / useDuel. */
const KEY_LEFT = new Set(["ArrowLeft", "a", "A"]);
const KEY_RIGHT = new Set(["ArrowRight", "d", "D"]);
const KEY_UP = new Set(["ArrowUp", "w", "W"]);
const KEY_DOWN = new Set(["ArrowDown", "s", "S"]);
const KEY_JUMP = new Set([" ", "Spacebar"]);

export interface RaceParticipant {
  slot: number;
  id: string;
}

export interface DuelResult {
  winnerId: string | null;
  tiebreakRule: string | null;
  player1Peak: number | null;
  player2Peak: number | null;
  forfeit: boolean;
  hasReplay: boolean;
}

export interface UseRaceOptions {
  tower: TowerSpec;
  seed: string;
  /** The local player's slot (0-based). */
  mySlot: number;
  /** All participants including me, in any order. */
  participants: RaceParticipant[];
  realtime: RealtimeHandle;
  duelId: string;
  /** Opaque guest token (guest:<nanoid>) when the local player is a guest. */
  guestId?: string | null;
}

export interface UseRaceResult {
  state: MatchState;
  myId: string;
  /** Start the countdown (call after the "start" event is received). */
  start: () => void;
  /** True once the match is over (result shown or being computed). */
  finished: boolean;
  /** True once the LOCAL run ended but the authoritative result hasn't landed. */
  awaitingResult: boolean;
  setTouch: (t: TouchInput) => void;
  duelResult: DuelResult | null;
  /** Whether duelResult is the instant local guess or the server's truth. */
  resultSource: ResultSource;
  /** True when the opponent's live snapshots have gone quiet mid-race. */
  opponentStale: boolean;
  /** Local player forfeits (they lose). */
  forfeit: () => void;
  /** A peer abandoned — resolve the local player as the winner. */
  opponentForfeited: () => void;
  /** True when every result-submit attempt failed (offer a manual retry). */
  resultError: boolean;
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

export function useRace({
  tower,
  seed,
  mySlot,
  participants,
  realtime,
  duelId,
  guestId = null,
}: UseRaceOptions): UseRaceResult {
  // Deterministic slot→id order for the sim (matches the server's re-sim, which
  // builds players from the participant list sorted by slot).
  const sorted = [...participants].sort((a, b) => a.slot - b.slot);
  const playerIds = sorted.map((p) => p.id);
  const myId = participants.find((p) => p.slot === mySlot)?.id ?? playerIds[0] ?? "";

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
  }, [tower, seed]);

  const [state, setState] = useState<MatchState>(() => makeMatch());
  const stateRef = useRef(state);
  stateRef.current = state;

  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [resultError, setResultError] = useState(false);
  /** Where the shown result came from: the instant local sim vs the server. */
  const [resultSource, setResultSource] = useState<ResultSource>(null);
  /** True when the opponent's snapshots have gone quiet mid-race (their line dropped). */
  const [opponentStale, setOpponentStale] = useState(false);

  // Ghost store — peers' interpolated positions from their snapshots.
  const ghostsRef = useRef(new GhostStore());

  // Loop state.
  const localInputLog = useRef<PlayerInput[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<TouchInput>(NO_TOUCH);
  const runningRef = useRef(false);
  const accumulatorRef = useRef(0);
  const lastTsRef = useRef(0);
  const resultSubmittedRef = useRef(false);
  const forfeitedRef = useRef(false);
  const finishHandledRef = useRef(false);
  const matchStartedRef = useRef(false);
  const lastOutcomeRef = useRef<"win" | "loss" | "forfeit" | null>(null);
  // Latest Firebase ID token, captured while the page is alive so the unload
  // forfeit beacon (which can't await) has a synchronous credential. Tokens live
  // ~1 h — far longer than a match — so one captured at start covers the race.
  const authTokenRef = useRef<string | null>(null);
  const lastSnapshotAtRef = useRef(0);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const cur = stateRef.current;
      if (cur.phase !== "countdown" && cur.phase !== "climb") return;
      const target = e.target;
      if (target instanceof Element && target.closest("button,a[href],input,select,textarea")) return;
      const isGameKey =
        KEY_LEFT.has(e.key) || KEY_RIGHT.has(e.key) || KEY_UP.has(e.key) ||
        KEY_DOWN.has(e.key) || KEY_JUMP.has(e.key);
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

  // ── Peer snapshots → ghost store ────────────────────────────────────────────
  useEffect(() => {
    const store = ghostsRef.current;
    const unsub = realtime.onSnapshot((msg) => {
      if (msg.slot === mySlot) return; // ignore echoes of our own snapshots
      store.ingest(msg);
      lastSnapshotAtRef.current = Date.now();
    });
    return unsub;
  }, [realtime, mySlot]);

  // Keep a fresh Firebase ID token in a ref for the unload forfeit beacon (it
  // can't await on exit). Subscribing to token changes — rather than a one-shot
  // capture at start() — ensures a signed-in player whose auth resolves late
  // still authenticates the beacon, so their opponent is awarded the win instead
  // of the match degrading to a no-winner reaper void.
  useEffect(() => {
    authTokenRef.current = null;
    const unsub = auth.onIdTokenChanged((user) => {
      if (!user) {
        authTokenRef.current = null;
        return;
      }
      void user.getIdToken().then((t) => {
        authTokenRef.current = t;
      }).catch(() => {});
    });
    return unsub;
  }, []);

  // Forfeit-on-leave: if the player abandons a match in progress (tab close /
  // navigation), tell the SERVER via a keepalive fetch so the duel resolves
  // deterministically — the opponent is awarded the win and stats record. The
  // peer-facing Ably "forfeit" event (published by DuelRoom) only updates the
  // opponent's live view; it never reaches the server. Fires only for an
  // in-progress, unfinished, not-yet-forfeited match.
  useEffect(() => {
    const beacon = () => {
      if (!matchStartedRef.current) return;
      if (finishHandledRef.current || forfeitedRef.current || resultSubmittedRef.current) return;
      forfeitedRef.current = true;
      const token = authTokenRef.current;
      try {
        void fetch(`/api/duel/${duelId}/result`, {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            seed,
            claimedOutcome: "forfeit",
            ...(guestId ? { guestId } : {}),
          }),
        });
      } catch {
        // Best-effort — the stale-duel reaper is the backstop.
      }
    };
    const onPageHide = () => beacon();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [duelId, seed, guestId]);

  /**
   * Slave every non-local player's position/status to its latest interpolated
   * ghost, so the shared hazard (catch-up rubber-band + slow-lava) and the
   * renderer see approximately-correct peer state. Called each tick before
   * stepMatch (which, in localSlot mode, will NOT integrate these peers).
   */
  const applyGhosts = useCallback(
    (cur: MatchState) => {
      const store = ghostsRef.current;
      for (const p of cur.players) {
        if (p.slot === mySlot) continue;
        const g = store.sampleAt(p.slot, cur.tick);
        if (!g) continue;
        p.x = g.x;
        p.y = g.y;
        p.status = g.status;
        p.peakY = g.peakY;
        // Carry the peer's slow-lava into the shared hazard by synthesizing an
        // active entry (ghosts don't ship full power-up state). Refreshed every
        // tick, so a short window that always covers "now" is enough.
        p.activePowerUps = g.slowLavaActive
          ? [{ type: "slow-lava", startTick: cur.tick, durationTicks: 4 }]
          : [];
      }
    },
    [mySlot]
  );

  const publishSnapshot = useCallback(
    (cur: MatchState, me: PlayerState) => {
      realtime.publishSnapshot({
        slot: mySlot,
        tick: cur.tick,
        x: me.x,
        y: me.y,
        status: me.status,
        peakY: me.peakY,
        slowLavaActive: isPowerUpActive(me, "slow-lava", cur.tick),
      });
    },
    [realtime, mySlot]
  );

  // ── Result submission (authoritative) ───────────────────────────────────────
  const applyServerResult = useCallback(
    (body: {
      winnerId?: string | null;
      player1Peak?: number | null;
      player2Peak?: number | null;
      tiebreakRule?: string | null;
      forfeit?: boolean;
    }) => {
      setDuelResult({
        winnerId: body.winnerId ?? null,
        tiebreakRule: body.tiebreakRule ?? null,
        player1Peak: body.player1Peak ?? null,
        player2Peak: body.player2Peak ?? null,
        forfeit: Boolean(body.forfeit),
        hasReplay: true,
      });
      setResultSource("authoritative");
      setAwaitingResult(false);
      setResultError(false);
    },
    []
  );

  /**
   * Poll the duel meta until the server has recorded the completed result. Used
   * only on the 202 (pending — opponent's replay not in yet) path: the first
   * submitter otherwise never learns the authoritative winner.
   */
  const pollForResult = useCallback(async () => {
    const token = await getFirebaseToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const delays = [1000, 1500, 2000, 3000, 3000, 5000, 5000];
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await fetch(`/api/duel/${duelId}`, { headers });
        if (!res.ok) continue;
        const meta = (await res.json()) as {
          status?: string;
          winnerId?: string | null;
          player1Peak?: number | null;
          player2Peak?: number | null;
          tiebreakRule?: string | null;
          forfeit?: boolean;
        };
        if (meta.status === "completed" || meta.status === "voided") {
          applyServerResult(meta);
          return;
        }
      } catch {
        // transient — keep polling
      }
    }
    // Never resolved in time — surface a manual retry.
    setResultError(true);
  }, [duelId, applyServerResult]);

  const submitResult = useCallback(
    async (claimedOutcome: "win" | "loss" | "forfeit") => {
      if (resultSubmittedRef.current) return;
      resultSubmittedRef.current = true;
      lastOutcomeRef.current = claimedOutcome;

      const base64 = await packAndEncodeInputLog(localInputLog.current);
      const token = await getFirebaseToken();
      const body = JSON.stringify({
        seed,
        inputLog: base64,
        claimedOutcome,
        ...(guestId ? { guestId } : {}),
      });

      const delays = [0, 750, 2000, 4000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
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
          if (res.status >= 500) continue; // transient — retry
          if (res.status === 202) {
            // Pending: opponent's replay not in yet. Poll meta for the winner.
            void pollForResult();
            return;
          }
          if (res.ok) {
            const payload = (await res.json().catch(() => null)) as
              | Parameters<typeof applyServerResult>[0]
              | null;
            if (payload && payload.winnerId !== undefined) applyServerResult(payload);
            else void pollForResult();
            return;
          }
          // Other 4xx (e.g. already submitted / cheat) — try to read the recorded
          // result from meta rather than dead-ending.
          void pollForResult();
          return;
        } catch {
          clearTimeout(timer);
        }
      }
      resultSubmittedRef.current = false;
      setResultError(true);
    },
    [duelId, seed, guestId, applyServerResult, pollForResult]
  );

  const retrySubmit = useCallback(() => {
    if (lastOutcomeRef.current) {
      setResultError(false);
      resultSubmittedRef.current = false;
      submitResult(lastOutcomeRef.current);
    }
  }, [submitResult]);

  const forfeit = useCallback(() => {
    if (forfeitedRef.current) return;
    forfeitedRef.current = true;
    runningRef.current = false;
    realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "leave" });
    submitResult("forfeit");
    const cur = stateRef.current;
    setDuelResult({
      winnerId: sorted.find((p) => p.slot !== mySlot)?.id ?? null,
      tiebreakRule: null,
      player1Peak: cur.players[0]?.peakY ?? null,
      player2Peak: cur.players[1]?.peakY ?? null,
      forfeit: true,
      hasReplay: false,
    });
    setResultSource("authoritative");
    setState((prev) => ({ ...prev, phase: "finished" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySlot, realtime, submitResult]);

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
      hasReplay: false,
    });
    setResultSource("authoritative");
    setState((prev) => ({ ...prev, phase: "finished" }));
  }, [myId, submitResult]);

  // ── Foreground resync: reset only the fixed-timestep clock ──────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      accumulatorRef.current = 0;
      lastTsRef.current = 0;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── Fixed-timestep rAF loop (ungated — never waits on a peer) ────────────────
  useEffect(() => {
    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!runningRef.current) return;

      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.25) dt = 0.25;
      accumulatorRef.current += dt * 1000;

      let cur = stateRef.current;
      let advanced = false;

      while (accumulatorRef.current >= TICK_DT_MS) {
        accumulatorRef.current -= TICK_DT_MS;

        // Slave peers to their ghosts BEFORE stepping so the shared hazard sees
        // approximately-correct peer heights this tick.
        applyGhosts(cur);

        const localInput = sampleInput();
        cur = stepMatch(cur, { [mySlot]: localInput }, DEFAULT_SIM_CONFIG, {
          localSlot: mySlot,
        });
        advanced = true;

        if (cur.phase === "climb") {
          localInputLog.current.push(localInput);
        }

        // Publish our own snapshot a few times a second. Modulo the tick (not a
        // delta) so the countdown→climb tick reset can't stall the cadence.
        if (cur.tick % SNAPSHOT_EVERY_TICKS === 0) {
          const me = cur.players.find((p) => p.slot === mySlot);
          if (me) publishSnapshot(cur, me);
        }

        if (cur.phase === "finished" || cur.phase === "results") {
          runningRef.current = false;
          if (!finishHandledRef.current) {
            finishHandledRef.current = true;
            // Tell peers our final state so their live view can resolve promptly.
            const me = cur.players.find((p) => p.slot === mySlot);
            if (me) publishSnapshot(cur, me);

            // Show the LOCAL sim's result immediately (provisional) so the player
            // is never stuck waiting on the opponent's replay — the server can't
            // complete the joint re-sim until both have submitted, and the loser
            // typically finishes while the winner is still climbing. We reconcile
            // to the authoritative server result if/when it lands (see
            // applyServerResult); divergence is rare (only very close races).
            const p0 = cur.players.find((p) => p.slot === 0);
            const p1 = cur.players.find((p) => p.slot === 1);
            setDuelResult({
              winnerId: cur.winnerId,
              tiebreakRule: cur.tiebreakRule,
              player1Peak: p0?.peakY ?? null,
              player2Peak: p1?.peakY ?? null,
              forfeit: false,
              hasReplay: true,
            });
            setResultSource("provisional");
            setAwaitingResult(true);

            // claimedOutcome is advisory only — the server ignores it on the
            // normal path (the winner is re-simulated).
            const localOutcome = cur.winnerId === myId ? "win" : "loss";
            submitResult(localOutcome);
          }
          break;
        }
      }

      // Surface a dropped opponent line: no snapshot for a while mid-race.
      // (React bails on an unchanged boolean, so this is cheap per frame.)
      const stale =
        cur.phase === "climb" &&
        lastSnapshotAtRef.current > 0 &&
        Date.now() - lastSnapshotAtRef.current > OPPONENT_STALE_MS;
      setOpponentStale(stale);

      if (advanced) {
        setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleInput, applyGhosts, publishSnapshot, submitResult, mySlot, myId]);

  const start = useCallback(() => {
    const fresh = makeMatch();
    fresh.phase = "countdown";
    fresh.tick = 0;
    accumulatorRef.current = 0;
    lastTsRef.current = 0;
    localInputLog.current = [];
    resultSubmittedRef.current = false;
    forfeitedRef.current = false;
    finishHandledRef.current = false;
    matchStartedRef.current = true;
    lastSnapshotAtRef.current = 0;
    ghostsRef.current.clear();
    setAwaitingResult(false);
    setResultError(false);
    setResultSource(null);
    setOpponentStale(false);
    stateRef.current = fresh;
    setState(fresh);
    runningRef.current = true;
  }, [makeMatch]);

  const setTouch = useCallback((tch: TouchInput) => {
    touchRef.current = tch;
  }, []);

  const finished =
    state.phase === "finished" || state.phase === "results" || duelResult !== null;

  return {
    state,
    myId,
    start,
    finished,
    awaitingResult,
    setTouch,
    duelResult,
    resultSource,
    opponentStale,
    forfeit,
    opponentForfeited,
    resultError,
    retrySubmit,
  };
}
