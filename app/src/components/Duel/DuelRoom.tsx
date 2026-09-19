"use client";

/**
 * /duel/[id] room — orchestrates the full match lifecycle.
 * Lobby → Ready-up → Countdown → Live race → Finished → Result
 *
 * Lifecycle:
 *   1. Fetch duel metadata. If pending, POST /join first.
 *   2. Connect Ably. Subscribe to control events + presence, then enter presence.
 *   3. Both players manually tap Ready in the shared lobby. Coordinator (slot-0)
 *      waits for both "ready" events, then publishes "start" with a wall-clock
 *      countdown timestamp (`countdownStartsAt`).
 *   4. On "start" → call useRace.start() → wall-clock countdown → climb.
 *   5. On finish → show DuelResult.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "../../contexts/AuthContext";
import { useRace, RaceParticipant } from "../../game/useRace";
import { ClimbCanvas } from "../Game/ClimbCanvas";
import {
  TouchControls,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
} from "../Game/TouchControls";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useSafeAreaInsets } from "../../hooks/useSafeAreaInsets";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFullscreen } from "../../hooks/useFullscreen";
import { FullscreenButton } from "../Game/FullscreenButton";
import { GameExitButton, GAME_EXIT_BAR_PX } from "../Game/GameExitButton";
import { DuelResult } from "./DuelResult";
import { connectRealtime, RealtimeHandle } from "../../net/realtime";
import { buildTower } from "../../game/towers";
import { createMatch } from "../../game/simulation";
import { formatAltitude } from "../../lib/units";
import { shareInvite } from "../../lib/shareInvite";

// ─────────────────────────────── Types ────────────────────────────────────

interface DuelMeta {
  id: string;
  status: string;
  seed: string;
  categorySlug: string;
  player1: { id: string; displayName: string | null } | null;
  player2: { id: string; displayName: string | null } | null;
  winnerId: string | null;
  player1Peak: number | null;
  player2Peak: number | null;
  forfeit: boolean;
  tiebreakRule: string | null;
}

type RoomPhase =
  | "loading"         // fetching meta + connecting realtime
  | "waiting"         // in presence, waiting for opponent
  | "countdown"       // sim running countdown
  | "climb"           // live race
  | "finished"        // match over
  | "error";

interface DuelRoomProps {
  duelId: string;
}

/** Wall-clock buffer before countdown numerals begin (ms). */
const COUNTDOWN_BUFFER_MS = 500;
/** Wall-clock countdown duration (ms). */
const COUNTDOWN_DURATION_MS = 3000;
/** Both present, no ready for this long → "Ready up!" nudge. */
const READY_NUDGE_MS = 60_000;
/** AFK in lobby this long → auto-forfeit. */
const AFK_FORFEIT_MS = 120_000;

// ─────────────────────────────── Waiting lobby ───────────────────────────

/**
 * Static lobby scene shown while waiting for an opponent to accept the invite.
 * Renders a single idle character at the tower base (no playable warm-up). The
 * invite/share UX overlays the scene. Replaced by DuelGame once the seed lands.
 */
function WaitingLobby({
  categorySlug,
  myName,
  touchDevice,
  linkCopied,
  waitedTooLong,
  onCopyLink,
  onLeave,
}: {
  categorySlug: string;
  myName: string;
  touchDevice: boolean;
  linkCopied: boolean;
  waitedTooLong: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
}) {
  const [lobbyState] = useState(() => {
    const tower = buildTower(categorySlug);
    const m = createMatch({
      seed: "lobby-" + Date.now(),
      mode: "solo",
      tower,
      playerIds: ["me"],
    });
    m.phase = "lobby";
    return m;
  });

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: touchDevice });
  const safeArea = useSafeAreaInsets();
  const sceneRef = useRef<HTMLDivElement>(null);
  const {
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen(sceneRef);
  useBodyScrollLock(true);

  const playerNames: Record<string, string> = { me: myName };

  return (
    <div
      ref={sceneRef}
      className={
        touchDevice
          ? "fixed inset-0 z-40 bg-void text-text-primary"
          : isFullscreen
            ? "flex h-screen w-screen flex-col items-center gap-3 overflow-hidden bg-void py-4 text-text-primary"
            : "flex flex-col items-center gap-3 min-h-screen bg-void text-text-primary py-4"
      }
    >
      {/* Desktop-only placeholder HUD, same shape as DuelGame's real one so
          the transition into the real match doesn't cause a layout shift. */}
      {!touchDevice && (
        <div
          className="flex flex-col overflow-hidden rounded-xl border border-border-subtle"
          style={{ width: canvasSize.width }}
        >
          <div className="w-full flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
            <div className="font-mono text-xs tabular-nums">
              <span className="text-signal">You</span>
              <span className="text-text-muted mx-1">vs</span>
              <span className="text-text-muted">Waiting…</span>
            </div>
          </div>
          <div className="w-full flex flex-col gap-1 px-4 py-2.5 bg-surface-raised">
            {[
              { key: "you", name: "You", color: "text-signal" },
              { key: "opp", name: "Opponent", color: "text-text-muted" },
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className={`font-mono text-[11px] tabular-nums truncate w-24 shrink-0 ${row.color}`}>
                  {row.name}
                </span>
                <div
                  className="relative flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden"
                  aria-hidden="true"
                />
                <span className="font-mono text-[11px] tabular-nums text-text-muted w-14 text-right shrink-0">
                  —
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={canvasBoxRef}
        data-climb-surface
        className={
          touchDevice ? "relative h-full w-full overflow-hidden" : "relative"
        }
        style={touchDevice ? undefined : { width: canvasSize.width }}
      >
        <ClimbCanvas
          state={lobbyState}
          width={canvasSize.width}
          height={canvasSize.height}
          fullBleed={touchDevice}
          hudInsetTop={touchDevice ? safeArea.top : 0}
          myId="me"
          playerNames={playerNames}
        />

        {touchDevice && (
          <GameExitButton safeArea={safeArea} onLeave={onLeave} label="Leave duel" />
        )}

        {/* Waiting HUD overlay */}
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-end justify-start p-4 gap-2 pointer-events-none"
          style={
            touchDevice
              ? {
                  paddingTop: `max(16px, ${safeArea.top + 8}px)`,
                  paddingRight: `max(16px, ${safeArea.right}px)`,
                }
              : undefined
          }
        >
          <div className="bg-void/80 backdrop-blur-xs rounded-xl border border-border-subtle px-3 py-2 pointer-events-auto max-w-[200px]">
            {!waitedTooLong ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <p className="font-mono text-xs text-text-secondary">
                    Waiting for opponent…
                  </p>
                </div>
                <button
                  onClick={onCopyLink}
                  className="inline-flex items-center justify-center rounded-full px-3 min-h-[36px] bg-signal text-void font-semibold text-xs hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  {linkCopied ? "Copied!" : "Share invite"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="font-mono text-xs text-text-secondary">
                  Opponent hasn&apos;t joined yet.
                </p>
                <button
                  onClick={onCopyLink}
                  className="inline-flex items-center justify-center rounded-full px-3 min-h-[36px] bg-signal text-void font-semibold text-xs hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                >
                  {linkCopied ? "Copied!" : "Share invite"}
                </button>
                <button
                  onClick={onLeave}
                  className="text-text-muted text-xs underline underline-offset-2"
                >
                  Back to duels
                </button>
              </div>
            )}
          </div>
        </div>

        {!touchDevice && fullscreenSupported && (
          <FullscreenButton
            isFullscreen={isFullscreen}
            onToggle={toggleFullscreen}
            className="absolute right-2 top-2 z-30"
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── Inner game component ─────────────────────

interface GameProps {
  duelId: string;
  seed: string;
  categorySlug: string;
  myId: string;
  guestId: string | null;
  mySlot: 0 | 1;
  realtime: RealtimeHandle;
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  onRematch: (newDuelId: string) => void;
  onExit: () => void;
}

function DuelGame({
  duelId,
  seed,
  categorySlug,
  myId,
  guestId,
  mySlot,
  realtime,
  player1Name,
  player2Name,
  player1Id,
  player2Id,
  onRematch,
  onExit,
}: GameProps) {
  const [tower] = useState(() => buildTower(categorySlug));

  const participants: RaceParticipant[] = [
    { slot: 0, id: player1Id },
    { slot: 1, id: player2Id },
  ];

  const {
    state,
    renderFeed,
    start,
    finished,
    awaitingResult,
    setTouch,
    duelResult,
    resultSource,
    opponentStale,
    opponentForfeited,
    resultError,
    retrySubmit,
  } = useRace({
    tower,
    seed,
    mySlot,
    participants,
    realtime,
    duelId,
    guestId,
  });

  const handleLeave = useCallback(() => {
    if (!finished) {
      try {
        realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "disconnect" });
      } catch {
        /* realtime may be down */
      }
    }
    onExit();
  }, [finished, realtime, mySlot, onExit]);

  const touchDevice = useCoarsePointer();
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: touchDevice });
  const safeArea = useSafeAreaInsets();
  const sceneRef = useRef<HTMLDivElement>(null);
  const {
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen(sceneRef);

  const startedRef = useRef(false);
  const [connectionState, setConnectionState] = useState<string>("connected");
  const bothPresentSinceRef = useRef(0);
  const readySlotsRef = useRef<Set<number>>(new Set());

  // ── Lobby ready-up state ────────────────────────────────────────────────────
  const [localReady, setLocalReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [opponentPresent, setOpponentPresent] = useState(false);
  const [readyNudge, setReadyNudge] = useState(false);
  const joinBeatFiredRef = useRef(false);

  // ── Wall-clock countdown ────────────────────────────────────────────────────
  const countdownStartsAtRef = useRef(0);
  const [countdownStartsAt, setCountdownStartsAt] = useState(0);
  const [wallClockCountdown, setWallClockCountdown] = useState(0);

  const opponentSlot = mySlot === 0 ? 1 : 0;

  // Ready button: publish event + update presence data.
  const handleReady = useCallback(() => {
    setLocalReady(true);
    readySlotsRef.current.add(mySlot);
    realtime.publishEvent({ type: "ready", slot: mySlot });
    realtime.updatePresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
      ready: true,
    });
  }, [realtime, myId, mySlot, player1Name, player2Name]);

  const handleUnready = useCallback(() => {
    setLocalReady(false);
    readySlotsRef.current.delete(mySlot);
    realtime.publishEvent({ type: "unready", slot: mySlot });
    realtime.updatePresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
      ready: false,
    });
  }, [realtime, myId, mySlot, player1Name, player2Name]);

  // ── Handshake (manual ready-up, coordinator-driven start) ─────────────────
  useEffect(() => {
    let disposed = false;

    const beginMatch = (startTimestamp: number) => {
      if (startedRef.current) return;
      startedRef.current = true;
      stopPoll();
      countdownStartsAtRef.current = startTimestamp;
      setCountdownStartsAt(startTimestamp);

      const delay = Math.max(0, startTimestamp - Date.now());
      if (delay > 0) {
        setTimeout(() => {
          if (!disposed) start();
        }, delay);
      } else {
        start();
      }
    };

    const LEAVE_GRACE_MS = 12_000;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLeaveTimer = () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
    };

    let rebroadcasts = 0;
    let rebroadcastTimer: ReturnType<typeof setInterval> | null = null;
    const stopRebroadcast = () => {
      if (rebroadcastTimer) {
        clearInterval(rebroadcastTimer);
        rebroadcastTimer = null;
      }
    };

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function stopPoll() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    const SLOT1_FALLBACK_MS = 5000;

    const tryCoordinatorStart = () => {
      if (startedRef.current || disposed) return;
      if (readySlotsRef.current.size < 2) return;

      if (mySlot === 0) {
        const countdownTs = Date.now() + COUNTDOWN_BUFFER_MS;
        beginMatch(countdownTs);
        realtime.publishEvent({ type: "start", serverTimestamp: countdownTs });
        stopRebroadcast();
        rebroadcasts = 0;
        rebroadcastTimer = setInterval(() => {
          rebroadcasts += 1;
          if (disposed || rebroadcasts > 7) {
            stopRebroadcast();
            return;
          }
          realtime.publishEvent({ type: "start", serverTimestamp: countdownTs });
        }, 400);
      }
    };

    const evaluateStart = async () => {
      if (startedRef.current || disposed) return;
      const members = await realtime.getPresence().catch(() => []);
      if (disposed || startedRef.current) return;
      if (members.length < 2) return;

      if (bothPresentSinceRef.current === 0) {
        bothPresentSinceRef.current = Date.now();
      }

      if (mySlot === 0) {
        tryCoordinatorStart();
      } else {
        if (
          readySlotsRef.current.size >= 2 &&
          bothPresentSinceRef.current > 0 &&
          Date.now() - bothPresentSinceRef.current >= SLOT1_FALLBACK_MS
        ) {
          beginMatch(Date.now());
        }
      }
    };

    // 1) Subscribe first — before we enter presence.
    const unsubStart = realtime.onEvent("start", (msg) => {
      const ts = msg.serverTimestamp ?? Date.now();
      beginMatch(ts);
    });

    const unsubReady = realtime.onEvent("ready", (msg) => {
      if (typeof msg.slot === "number") {
        readySlotsRef.current.add(msg.slot);
        if (msg.slot !== mySlot) setOpponentReady(true);
        tryCoordinatorStart();
      }
    });

    const unsubUnready = realtime.onEvent("unready", (msg) => {
      if (typeof msg.slot === "number") {
        readySlotsRef.current.delete(msg.slot);
        if (msg.slot !== mySlot) setOpponentReady(false);
      }
    });

    const unsubForfeit = realtime.onEvent("forfeit", () => {
      opponentForfeited();
    });

    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) {
        onRematch(msg.newDuelId);
      }
    });

    const unsubPresence = realtime.onPresence((action, member) => {
      if (action === "leave" || action === "absent") {
        if (member.clientId === myId) return;
        if (!startedRef.current) {
          setOpponentReady(false);
          setOpponentPresent(false);
          readySlotsRef.current.delete(opponentSlot);
          bothPresentSinceRef.current = 0;
          return;
        }
        clearLeaveTimer();
        leaveTimer = setTimeout(async () => {
          const members = await realtime.getPresence().catch(() => []);
          const opponentStillHere = members.some((m) => m.clientId !== myId);
          if (!opponentStillHere) opponentForfeited();
        }, LEAVE_GRACE_MS);
        return;
      }
      if (action !== "enter" && action !== "present" && action !== "update") return;
      if (member.clientId !== myId) {
        clearLeaveTimer();
        setOpponentPresent(true);
        if (
          !joinBeatFiredRef.current &&
          (action === "enter" || action === "present")
        ) {
          joinBeatFiredRef.current = true;
          setJoinBeat(true);
          setTimeout(() => setJoinBeat(false), 1800);
        }
      }
      evaluateStart();
    });

    // 2) Enter presence with ready: false.
    realtime.enterPresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
      ready: false,
    });

    // NO auto-ready: user must tap the Ready button.

    // 3) Poll presence as a safety net.
    evaluateStart();
    pollTimer = setInterval(evaluateStart, 600);

    const handleBeforeUnload = () => {
      realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "disconnect" });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      disposed = true;
      unsubStart();
      unsubReady();
      unsubUnready();
      unsubForfeit();
      unsubRematch();
      unsubPresence();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearLeaveTimer();
      stopPoll();
      stopRebroadcast();
    };
  }, [realtime, myId, mySlot, opponentSlot, player1Name, player2Name, start, onRematch, opponentForfeited]);

  // Surface connection health.
  useEffect(() => {
    const unsub = realtime.onConnectionState((s) => setConnectionState(s));
    return unsub;
  }, [realtime]);

  // ── Wall-clock countdown timer ──────────────────────────────────────────────
  useEffect(() => {
    if (countdownStartsAt === 0) return;
    const update = () => {
      const elapsed = Date.now() - countdownStartsAt;
      const remaining = Math.max(0, Math.ceil((COUNTDOWN_DURATION_MS - elapsed) / 1000));
      setWallClockCountdown(remaining);
    };
    update();
    const timer = setInterval(update, 50);
    return () => clearInterval(timer);
  }, [countdownStartsAt]);

  // ── Unready timeout: 60s nudge, 120s auto-forfeit ─────────────────────────
  useEffect(() => {
    const phase = state.phase;
    if (phase !== "lobby" || !opponentPresent) return;
    const since = bothPresentSinceRef.current;
    if (since === 0) return;

    const nudgeDelay = Math.max(0, READY_NUDGE_MS - (Date.now() - since));
    const forfeitDelay = Math.max(0, AFK_FORFEIT_MS - (Date.now() - since));

    const nudgeTimer = setTimeout(() => setReadyNudge(true), nudgeDelay);
    const forfeitTimer = setTimeout(() => handleLeave(), forfeitDelay);

    return () => {
      clearTimeout(nudgeTimer);
      clearTimeout(forfeitTimer);
    };
  }, [state.phase, opponentPresent, handleLeave]);

  const playerNames: Record<string, string> = {
    [player1Id]: player1Name,
    [player2Id]: player2Name,
  };

  const phase = state.phase;
  useBodyScrollLock(
    touchDevice || isFullscreen || phase === "lobby" || phase === "countdown" || phase === "climb"
  );

  const racers = [...state.players].sort((a, b) => a.slot - b.slot);
  const maxAlt = racers.reduce((m, p) => Math.max(m, p.y), 0);
  const leader = racers.reduce<typeof racers[number] | null>(
    (best, p) => (best === null || p.y > best.y ? p : best),
    null
  );

  // ── Delight beats ──────────────────────────────────────────────────────────
  const [joinBeat, setJoinBeat] = useState(false);
  const [liveBeat, setLiveBeat] = useState(false);
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== "climb" && phase === "climb") {
      setLiveBeat(true);
      const t = setTimeout(() => setLiveBeat(false), 900);
      prevPhaseRef.current = phase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  // Countdown numeral derived from wall-clock for cross-client sync.
  const countdownNum = countdownStartsAt > 0
    ? wallClockCountdown
    : Math.max(1, 3 - Math.floor(state.tick / 30));

  const bottomInset = touchDevice
    ? TOUCH_CONTROLS_INSET + Math.max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom)
    : 0;
  const touchControlsActive =
    touchDevice && (phase === "countdown" || phase === "climb");

  // Canvas props for lobby glow + opponent visibility.
  const readySlotsSet = useMemo(() => {
    const s = new Set<number>();
    if (localReady) s.add(mySlot);
    if (opponentReady) s.add(opponentSlot);
    return s;
  }, [localReady, opponentReady, mySlot, opponentSlot]);

  const hiddenSlotsSet = useMemo(() => {
    if (phase !== "lobby" || opponentPresent) return undefined;
    return new Set([opponentSlot]);
  }, [phase, opponentPresent, opponentSlot]);

  if (finished && duelResult) {
    return (
      <DuelResult
        winnerId={duelResult.winnerId}
        myId={myId}
        player1Id={player1Id}
        player2Id={player2Id}
        player1Name={player1Name}
        player2Name={player2Name}
        player1Peak={duelResult.player1Peak}
        player2Peak={duelResult.player2Peak}
        tiebreakRule={duelResult.tiebreakRule}
        forfeit={duelResult.forfeit}
        duelId={duelId}
        onRematch={onRematch}
        realtime={realtime}
        resultError={resultError}
        onRetrySubmit={retrySubmit}
        hasReplay={duelResult.hasReplay}
        resultSource={resultSource}
      />
    );
  }

  if (awaitingResult && !duelResult) {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Spinner size="lg" />
        <p className="font-mono text-sm text-text-secondary">Computing result…</p>
        {resultError && (
          <button
            onClick={retrySubmit}
            className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={sceneRef}
      className={
        touchDevice
          ? "fixed inset-0 z-40 bg-void text-text-primary"
          : isFullscreen
            ? "flex h-screen w-screen flex-col items-center gap-3 overflow-hidden bg-void py-4 text-text-primary"
            : "flex flex-col items-center gap-3 min-h-screen bg-void text-text-primary py-4"
      }
    >
      {touchDevice && (
        <GameExitButton safeArea={safeArea} onLeave={handleLeave} label="Leave duel" />
      )}

      {/* Versus HUD */}
      <div
        className={
          touchDevice
            ? "pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1"
            : "flex flex-col overflow-hidden rounded-xl border border-border-subtle"
        }
        style={
          touchDevice
            ? {
                paddingTop: safeArea.top + GAME_EXIT_BAR_PX,
                paddingLeft: `max(8px, ${safeArea.left}px)`,
                paddingRight: `max(8px, ${safeArea.right}px)`,
              }
            : { width: canvasSize.width }
        }
      >
        <div
          className={
            touchDevice
              ? "mx-2 flex items-center justify-between rounded-lg bg-void/70 px-3 py-2 backdrop-blur-xs"
              : "w-full flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle"
          }
        >
          <div className="font-mono text-xs tabular-nums">
            <span className="text-signal">{player1Name}</span>
            <span className="text-text-muted mx-1">vs</span>
            <span className="text-[#6bb8ff]">{player2Name}</span>
          </div>
          <div className="flex items-center gap-2">
            {(connectionState === "disconnected" ||
              connectionState === "suspended" ||
              connectionState === "connecting") && (
              <span className="font-mono text-xs text-warning motion-safe:animate-pulse" role="status">
                reconnecting…
              </span>
            )}
            {phase === "climb" &&
              opponentStale &&
              connectionState === "connected" && (
                <span
                  className="font-mono text-xs text-text-muted"
                  role="status"
                  aria-live="polite"
                >
                  opponent reconnecting…
                </span>
              )}
            {phase === "lobby" && (
              <span className="flex items-center gap-1 font-mono text-xs text-text-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${opponentPresent ? "bg-signal" : "bg-text-muted motion-safe:animate-pulse"}`} aria-hidden="true" />
                {opponentPresent ? "lobby" : "waiting"}
              </span>
            )}
            {phase === "climb" && (
              <span className="flex items-center gap-1 font-mono text-xs text-ember">
                <span className="w-1.5 h-1.5 rounded-full bg-ember motion-safe:animate-pulse" aria-hidden="true" />
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Live altitude race bar */}
        <div
          className={
            touchDevice
              ? "mx-2 flex flex-col gap-1 rounded-lg bg-void/60 px-3 py-2 backdrop-blur-xs"
              : "w-full flex flex-col gap-1 px-4 py-2.5 bg-surface-raised"
          }
        >
          {racers.map((p) => {
            const isMe = p.slot === mySlot;
            const isLeader = leader !== null && p.slot === leader.slot && maxAlt > 0;
            const isOpp = !isMe;
            const stale = isOpp && phase === "climb" && opponentStale;
            const pct = maxAlt > 0 ? Math.round((p.y / maxAlt) * 100) : 0;
            const barColor = p.slot === 0 ? "bg-signal" : "bg-[#6bb8ff]";
            const nameColor = p.slot === 0 ? "text-signal" : "text-[#6bb8ff]";
            const name = p.slot === 0 ? player1Name : player2Name;
            const isSlotReady = readySlotsSet.has(p.slot);
            return (
              <div key={p.slot} className="flex items-center gap-2">
                <span
                  className={`font-mono text-[11px] tabular-nums truncate w-24 shrink-0 ${nameColor} ${
                    stale ? "opacity-50" : ""
                  }`}
                >
                  {isLeader && (
                    <span aria-hidden="true" className="mr-0.5">
                      ▲
                    </span>
                  )}
                  {name}
                  {isMe && <span className="text-text-muted ml-1">(you)</span>}
                  {phase === "lobby" && isSlotReady && (
                    <span className="text-signal ml-1" aria-label="ready">&#10003;</span>
                  )}
                </span>
                <div
                  className="relative flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${name} altitude ${formatAltitude(p.y, 1)}${
                    isLeader ? ", leading" : ""
                  }${stale ? ", connection lost" : ""}`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out ${barColor} ${
                      stale ? "opacity-40" : ""
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={`font-mono text-[11px] tabular-nums text-text-secondary w-14 text-right shrink-0 ${
                    stale ? "opacity-50" : ""
                  }`}
                >
                  {formatAltitude(p.y, 1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Play stage */}
      <div
        ref={canvasBoxRef}
        data-climb-surface
        className={
          touchDevice ? "relative h-full w-full overflow-hidden" : "relative"
        }
        style={touchDevice ? undefined : { width: canvasSize.width }}
      >
        <ClimbCanvas
          state={state}
          feed={renderFeed}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed={touchDevice}
          hudInsetTop={touchDevice ? safeArea.top : 0}
          myId={myId}
          playerNames={playerNames}
          readySlots={readySlotsSet}
          hiddenSlots={hiddenSlotsSet}
        />

        {/* "Opponent joined!" beat — fires when opponent enters presence. */}
        {joinBeat && (
          <div
            className="absolute inset-x-0 top-[18%] flex justify-center pointer-events-none"
            role="status"
            aria-live="polite"
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-signal bg-void/70 rounded-full px-4 py-2 backdrop-blur-xs motion-safe:animate-rise [text-shadow:0_0_20px_rgb(203_242_77/0.4)]">
              Opponent joined
            </span>
          </div>
        )}

        {/* Lobby Ready button overlay */}
        {phase === "lobby" && opponentPresent && !startedRef.current && (
          <div className="absolute inset-x-0 bottom-[15%] flex flex-col items-center gap-3 pointer-events-none">
            {readyNudge && !localReady && (
              <span
                className="font-mono text-xs text-warning motion-safe:animate-pulse pointer-events-none"
                role="status"
                aria-live="polite"
              >
                Ready up!
              </span>
            )}
            {!localReady ? (
              <button
                onClick={handleReady}
                className="pointer-events-auto inline-flex items-center justify-center rounded-full px-8 min-h-[48px] bg-signal text-void font-display font-bold text-lg uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale] shadow-signal focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void"
                aria-label="Ready for match"
              >
                Ready
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2 pointer-events-auto">
                <span className="font-mono text-xs text-signal">
                  {opponentReady
                    ? "Starting…"
                    : "Waiting for opponent…"}
                </span>
                {!opponentReady && (
                  <button
                    onClick={handleUnready}
                    className="inline-flex items-center justify-center rounded-full px-6 min-h-[36px] border border-border-strong text-text-secondary text-xs hover:border-signal/50 transition-colors"
                    aria-label="Cancel ready"
                  >
                    Unready
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Countdown overlay (3-2-1) — wall-clock derived. */}
        {phase === "countdown" && countdownNum > 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-live="assertive"
            aria-atomic="true"
          >
            <div
              key={countdownNum}
              className="font-display text-8xl font-black text-signal motion-safe:animate-rise"
              style={{ textShadow: "0 0 40px rgb(203 242 77 / 0.5)" }}
            >
              {countdownNum}
            </div>
          </div>
        )}

        {/* "GO" flash */}
        {liveBeat && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-live="assertive"
            aria-atomic="true"
          >
            <span className="font-display text-7xl font-black uppercase text-ember motion-safe:animate-rise [text-shadow:0_0_44px_rgb(255_90_44/0.5)]">
              Go
            </span>
          </div>
        )}

        {touchDevice && (
          <TouchControls active={touchControlsActive} onInput={setTouch} />
        )}

        {!touchDevice && fullscreenSupported && (
          <FullscreenButton
            isFullscreen={isFullscreen}
            onToggle={toggleFullscreen}
            className="absolute right-2 top-2 z-30"
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── Room orchestrator ────────────────────────

export function DuelRoom({ duelId }: DuelRoomProps) {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<RoomPhase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [meta, setMeta] = useState<DuelMeta | null>(null);
  const [realtime, setRealtime] = useState<RealtimeHandle | null>(null);
  const [myId, setMyId] = useState<string>("");
  const [mySlot, setMySlot] = useState<0 | 1>(0);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);

  const realtimeRef = useRef<RealtimeHandle | null>(null);

  useEffect(() => {
    return () => {
      realtimeRef.current?.dispose();
    };
  }, []);

  // Load duel and connect
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    async function init() {
      const metaRes = await fetch(`/api/duel/${duelId}`, { headers: authHeaders });
      if (!metaRes.ok) {
        if (cancelled) return;
        const body = (await metaRes.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(body.error ?? "Duel not found.");
        setPhase("error");
        return;
      }

      const duelMeta = (await metaRes.json()) as DuelMeta;
      if (cancelled) return;

      const guestKey = `duel-guest:${duelId}`;
      let guestToken: string | null = user?.uid
        ? null
        : typeof window !== "undefined"
          ? window.sessionStorage.getItem(guestKey)
          : null;
      let localId = user?.uid ?? guestToken ?? "";

      if (duelMeta.status === "completed" || duelMeta.status === "voided") {
        setErrorMsg("This duel has already ended.");
        setPhase("error");
        return;
      }

      let finalMeta = duelMeta;
      if (duelMeta.status === "pending" && duelMeta.player1?.id !== localId) {
        const joinRes = await fetch(`/api/duel/${duelId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({}),
        });

        if (!joinRes.ok) {
          if (cancelled) return;
          const body = (await joinRes.json().catch(() => ({}))) as { error?: string; code?: string };
          if (body.code === "DUEL_NOT_PENDING" || body.code === "ALREADY_JOINED") {
            const refetch = await fetch(`/api/duel/${duelId}`, { headers: authHeaders });
            if (refetch.ok) finalMeta = (await refetch.json()) as DuelMeta;
          } else {
            setErrorMsg(body.error ?? "Could not join duel.");
            setPhase("error");
            return;
          }
        } else {
          const joinBody = (await joinRes.json()) as {
            seed: string;
            youId?: string;
            player1DisplayName: string | null;
            player2DisplayName: string | null;
          };
          if (joinBody.youId) {
            localId = joinBody.youId;
            if (!user?.uid && localId.startsWith("guest:") && typeof window !== "undefined") {
              guestToken = localId;
              window.sessionStorage.setItem(guestKey, localId);
            }
          }
          finalMeta = {
            ...duelMeta,
            seed: joinBody.seed,
            status: "active",
            player2: {
              id: localId,
              displayName: joinBody.player2DisplayName ?? null,
            },
          };
        }
      }

      if (cancelled) return;

      if (!localId) {
        setErrorMsg("This duel is no longer open to join.");
        setPhase("error");
        return;
      }

      if (!finalMeta.seed) {
        const refetch = await fetch(`/api/duel/${duelId}`, { headers: authHeaders });
        if (refetch.ok) finalMeta = (await refetch.json()) as DuelMeta;
      }

      const awaitingJoin =
        !finalMeta.seed &&
        finalMeta.status === "pending" &&
        finalMeta.player1?.id === localId;

      if (!finalMeta.seed && !awaitingJoin) {
        setErrorMsg("Could not load duel seed.");
        setPhase("error");
        return;
      }

      setMyId(localId);
      setMyGuestId(guestToken);
      setMeta(finalMeta);

      const slot: 0 | 1 = finalMeta.player1?.id === localId ? 0 : 1;
      setMySlot(slot);

      try {
        const handle = await connectRealtime(duelId, localId, guestToken);
        if (cancelled) {
          handle.dispose();
          return;
        }
        realtimeRef.current = handle;
        setRealtime(handle);
        setPhase("waiting");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error ? err.message : "Could not connect to realtime service."
        );
        setPhase("error");
      }
    }

    init().catch((err) => {
      if (!cancelled) {
        setErrorMsg(err instanceof Error ? err.message : "Unexpected error.");
        setPhase("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [duelId, user, token, authLoading]);

  const handleRematch = useCallback(
    (newDuelId: string) => {
      router.push(`/duel/${newDuelId}`);
    },
    [router]
  );

  // ── Waiting lobby (creator of a still-pending challenge) ──────────────────

  const awaitingOpponent = Boolean(meta && !meta.seed);
  const touchDevice = useCoarsePointer();
  const [linkCopied, setLinkCopied] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    if (!awaitingOpponent) return;
    let cancelled = false;

    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const refetch = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/duel/${duelId}`, { headers: authHeaders });
        if (!res.ok || cancelled) return;
        const fresh = (await res.json()) as DuelMeta;
        if (!cancelled && fresh.seed) setMeta(fresh);
      } catch {
        // Transient — the next tick retries.
      }
    };

    const timer = setInterval(refetch, 2000);
    const unsubPresence = realtime?.onPresence((action) => {
      if (action === "enter" || action === "present") void refetch();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubPresence?.();
    };
  }, [awaitingOpponent, realtime, duelId, token]);

  useEffect(() => {
    if (!awaitingOpponent) return;
    const t = setTimeout(() => setWaitedTooLong(true), 75_000);
    return () => clearTimeout(t);
  }, [awaitingOpponent]);

  const shareInviteLink = useCallback(async () => {
    const url = `${window.location.origin}/duel/${duelId}`;
    const outcome = await shareInvite(url);
    if (outcome === "copied") {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [duelId]);

  const handleLeaveLobby = useCallback(async () => {
    try {
      await fetch(`/api/duel/${duelId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Ignore
    }
    router.push("/duel");
  }, [duelId, token, router]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="font-mono text-sm text-text-secondary">Loading duel…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-ember text-base">{errorMsg}</p>
        <Link
          href="/duel"
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
        >
          Back to duels
        </Link>
      </div>
    );
  }

  if (!meta || !realtime) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!meta.seed) {
    const myName = meta.player1?.displayName ?? "You";
    return (
      <WaitingLobby
        categorySlug={meta.categorySlug}
        myName={myName}
        touchDevice={touchDevice}
        linkCopied={linkCopied}
        waitedTooLong={waitedTooLong}
        onCopyLink={shareInviteLink}
        onLeave={handleLeaveLobby}
      />
    );
  }

  const player1Name = meta.player1?.displayName ?? "Player 1";
  const player2Name = meta.player2?.displayName ?? "Player 2";
  const player1Id = meta.player1?.id ?? "";
  const player2Id = meta.player2?.id ?? myId;

  return (
    <DuelGame
      duelId={duelId}
      seed={meta.seed}
      categorySlug={meta.categorySlug}
      myId={myId}
      guestId={myGuestId}
      mySlot={mySlot}
      realtime={realtime}
      player1Name={player1Name}
      player2Name={player2Name}
      player1Id={player1Id}
      player2Id={player2Id}
      onRematch={handleRematch}
      onExit={() => router.push("/")}
    />
  );
}
