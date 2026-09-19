import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch, API_BASE } from "../lib/api";
import { tapLight, tapMedium, notifySuccess } from "../lib/haptics";
import { useGameHaptics } from "../lib/useGameHaptics";

import { useRace, RaceParticipant } from "@app/game/useRace";
import { useClimb } from "@app/game/useClimb";
import { ClimbCanvas } from "@app/components/Game/ClimbCanvas";
import { ExpeditionHud, type DuelHudInfo } from "@app/components/Game/ExpeditionHud";
import {
  TouchControls,
  TOUCH_CONTROLS_INSET,
  TOUCH_CONTROLS_MIN_BOTTOM,
} from "@app/components/Game/TouchControls";
import { useCanvasSize } from "@app/hooks/useCanvasSize";
import { useSafeAreaInsets } from "@app/hooks/useSafeAreaInsets";
import { connectRealtime, RealtimeHandle } from "@app/net/realtime";
import { buildTower } from "@app/game/towers";
import { hazardPhase } from "@app/game/hazard";
import { formatAltitude } from "@app/lib/units";
import { shareInvite } from "@app/lib/shareInvite";

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
  rematchDuelId?: string | null;
}

type RoomPhase = "loading" | "waiting" | "active" | "error";

export function DuelRoomScreen() {
  const { id: duelId } = useParams<{ id: string }>();
  if (!duelId) return null;
  return <DuelRoomInner duelId={duelId} />;
}

function DuelRoomInner({ duelId }: { duelId: string }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<RoomPhase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [meta, setMeta] = useState<DuelMeta | null>(null);
  const [realtime, setRealtime] = useState<RealtimeHandle | null>(null);
  const [myId, setMyId] = useState("");
  const [mySlot, setMySlot] = useState<0 | 1>(0);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);

  const realtimeRef = useRef<RealtimeHandle | null>(null);

  useEffect(() => {
    return () => { realtimeRef.current?.dispose(); };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function init() {
      const metaRes = await apiFetch(`/api/duel/${duelId}`);
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
        const joinRes = await apiFetch(`/api/duel/${duelId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!joinRes.ok) {
          if (cancelled) return;
          const body = (await joinRes.json().catch(() => ({}))) as { error?: string; code?: string };
          if (body.code === "DUEL_NOT_PENDING" || body.code === "ALREADY_JOINED") {
            const refetch = await apiFetch(`/api/duel/${duelId}`);
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
        const refetch = await apiFetch(`/api/duel/${duelId}`);
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
      setMySlot(finalMeta.player1?.id === localId ? 0 : 1);

      try {
        const handle = await connectRealtime(duelId, localId, guestToken);
        if (cancelled) { handle.dispose(); return; }
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

    return () => { cancelled = true; };
  }, [duelId, user, authLoading]);

  const handleRematch = useCallback(
    (newDuelId: string) => navigate(`/duel/${newDuelId}`),
    [navigate],
  );

  if (phase === "loading") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-void">
        <Spinner />
        <p className="font-mono text-sm text-text-secondary">Loading duel&hellip;</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-void px-6 text-center">
        <p className="text-base text-ember">{errorMsg}</p>
        <button
          onClick={() => { void tapLight(); navigate("/"); }}
          className="rounded-full border border-border-strong px-6 py-3 text-sm text-text-secondary active:scale-95"
        >
          Back to duels
        </button>
      </div>
    );
  }

  if (!meta || !realtime) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-void">
        <Spinner />
      </div>
    );
  }

  if (!meta.seed) {
    return (
      <WaitingLobby
        duelId={duelId}
        meta={meta}
        realtime={realtime}
        onSeedReady={(fresh) => setMeta(fresh)}
        onLeave={() => {
          apiFetch(`/api/duel/${duelId}`, { method: "DELETE" }).catch(() => {});
          navigate("/");
        }}
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
    />
  );
}

/* ──── Waiting lobby (creator sees practice game while waiting) ──────── */

function WaitingLobby({
  duelId,
  meta,
  realtime,
  onSeedReady,
  onLeave,
}: {
  duelId: string;
  meta: DuelMeta;
  realtime: RealtimeHandle;
  onSeedReady: (meta: DuelMeta) => void;
  onLeave: () => void;
}) {
  const [tower] = useState(() => buildTower(meta.categorySlug));
  const { state, renderFeed, start, finished, setTouch } = useClimb({ tower });

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();
  const bottomInset =
    TOUCH_CONTROLS_INSET + Math.max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom);

  const phase = state.phase;
  const touchActive = phase === "countdown" || phase === "climb";

  const [linkCopied, setLinkCopied] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => { start(); }, [start]);
  useEffect(() => { if (finished) start(); }, [finished, start]);

  useEffect(() => {
    let cancelled = false;
    const refetch = async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch(`/api/duel/${duelId}`);
        if (!res.ok || cancelled) return;
        const fresh = (await res.json()) as DuelMeta;
        if (!cancelled && fresh.seed) onSeedReady(fresh);
      } catch { /* next tick */ }
    };

    const timer = setInterval(refetch, 2000);
    const unsubPresence = realtime.onPresence((action) => {
      if (action === "enter" || action === "present") void refetch();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubPresence();
    };
  }, [duelId, realtime, onSeedReady]);

  useEffect(() => {
    const t = setTimeout(() => setWaitedTooLong(true), 75_000);
    return () => clearTimeout(t);
  }, []);

  const shareInviteLink = useCallback(async () => {
    void tapLight();
    const url = `${API_BASE}/duel/${duelId}`;
    const outcome = await shareInvite(url);
    if (outcome === "copied") {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [duelId]);

  return (
    <div className="fixed inset-0 z-40 bg-void">
      <div
        ref={canvasBoxRef}
        data-climb-surface
        className="relative h-full w-full overflow-hidden"
      >
        <ClimbCanvas
          state={state}
          feed={renderFeed}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed
          hudInsetTop={safeArea.top}
        />

        {/* Waiting overlay */}
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-end p-4 pointer-events-none"
          style={{ paddingTop: `max(16px, ${safeArea.top + 8}px)` }}
        >
          <div className="pointer-events-auto max-w-[200px] rounded-xl border border-border-subtle bg-void/80 px-3 py-2 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <p className="font-mono text-xs text-text-secondary">
                  {waitedTooLong ? "Opponent hasn't joined yet." : "Waiting for opponent…"}
                </p>
              </div>
              <button
                onClick={shareInviteLink}
                className="flex w-full items-center justify-center rounded-full bg-signal px-3 py-2 font-display text-xs font-bold text-void active:scale-95"
              >
                {linkCopied ? "Copied!" : "Share invite"}
              </button>
              <button
                onClick={() => { void tapLight(); onLeave(); }}
                className="text-xs text-text-muted underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
          <p className="mt-2 rounded-sm bg-void/70 px-2 py-1 font-mono text-[10px] text-text-muted pointer-events-none">
            warm-up &middot; not ranked
          </p>
        </div>

        {touchActive && <TouchControls active={touchActive} onInput={setTouch} />}
      </div>
    </div>
  );
}

/* ──── Live duel game ────────────────────────────────────────────────── */

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
}: {
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
}) {
  const [tower] = useState(() => buildTower(categorySlug));

  const participants: RaceParticipant[] = [
    { slot: 0, id: player1Id },
    { slot: 1, id: player2Id },
  ];

  const {
    state,
    simRef,
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

  // In-run taptics for the local racer: jump / land / power-up / ladder.
  useGameHaptics(simRef, mySlot, duelId);

  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasBoxRef, { fill: true });
  const safeArea = useSafeAreaInsets();
  const bottomInset =
    TOUCH_CONTROLS_INSET + Math.max(TOUCH_CONTROLS_MIN_BOTTOM, safeArea.bottom);

  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [connectionState, setConnectionState] = useState("connected");

  const phase = state.phase;
  const touchActive = phase === "countdown" || phase === "climb";
  const [muted, setMuted] = useState(false);

  // Leaving mid-race forfeits (opponent wins immediately, not stranded on a
  // ghost); mirrors the beforeunload forfeit. After the match it's just nav.
  const handleLeave = useCallback(() => {
    void tapLight();
    if (!finished) {
      try {
        realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "disconnect" });
      } catch {
        /* realtime down — navigate away regardless */
      }
    }
    navigate("/");
  }, [finished, realtime, mySlot, navigate]);

  // Handshake: subscribe first, then enter presence.
  useEffect(() => {
    let disposed = false;

    const beginMatch = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      stopPoll();
      start();
    };

    const LEAVE_GRACE_MS = 12_000;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLeaveTimer = () => { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; } };

    let rebroadcasts = 0;
    let rebroadcastTimer: ReturnType<typeof setInterval> | null = null;
    const stopRebroadcast = () => { if (rebroadcastTimer) { clearInterval(rebroadcastTimer); rebroadcastTimer = null; } };

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    const SLOT1_FALLBACK_MS = 5000;
    let bothPresentSince = 0;

    const evaluateStart = async () => {
      if (startedRef.current || disposed) return;
      const members = await realtime.getPresence().catch(() => []);
      if (disposed || startedRef.current) return;
      if (members.length < 2) { bothPresentSince = 0; return; }

      if (mySlot === 0) {
        beginMatch();
        realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        stopRebroadcast();
        rebroadcasts = 0;
        rebroadcastTimer = setInterval(() => {
          rebroadcasts += 1;
          if (disposed || rebroadcasts > 5) { stopRebroadcast(); return; }
          realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        }, 400);
      } else {
        if (bothPresentSince === 0) bothPresentSince = Date.now();
        else if (Date.now() - bothPresentSince >= SLOT1_FALLBACK_MS) beginMatch();
      }
    };

    const unsubStart = realtime.onEvent("start", () => beginMatch());
    const unsubForfeit = realtime.onEvent("forfeit", () => opponentForfeited());
    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) onRematch(msg.newDuelId);
    });

    const unsubPresence = realtime.onPresence((action, member) => {
      if (action === "leave" || action === "absent") {
        if (member.clientId === myId || !startedRef.current) return;
        clearLeaveTimer();
        leaveTimer = setTimeout(async () => {
          const members = await realtime.getPresence().catch(() => []);
          const opponentStillHere = members.some((m) => m.clientId !== myId);
          if (!opponentStillHere) opponentForfeited();
        }, LEAVE_GRACE_MS);
        return;
      }
      if (action !== "enter" && action !== "present") return;
      if (member.clientId !== myId) clearLeaveTimer();
      evaluateStart();
    });

    realtime.enterPresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
    });

    evaluateStart();
    pollTimer = setInterval(evaluateStart, 600);

    const handleBeforeUnload = () => {
      realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "disconnect" });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      disposed = true;
      unsubStart();
      unsubForfeit();
      unsubRematch();
      unsubPresence();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearLeaveTimer();
      stopPoll();
      stopRebroadcast();
    };
  }, [realtime, myId, mySlot, player1Name, player2Name, start, onRematch, opponentForfeited]);

  useEffect(() => {
    const unsub = realtime.onConnectionState((s) => setConnectionState(s));
    return unsub;
  }, [realtime]);

  const playerNames: Record<string, string> = {
    [player1Id]: player1Name,
    [player2Id]: player2Name,
  };

  const racers = [...state.players].sort((a, b) => a.slot - b.slot);
  const maxAlt = racers.reduce((m, p) => Math.max(m, p.y), 0);
  const leader = racers.reduce<typeof racers[number] | null>(
    (best, p) => (best === null || p.y > best.y ? p : best),
    null,
  );

  const myPlayer = racers.find((p) => p.slot === mySlot);
  const lavaPhaseInfo = hazardPhase(state.raceSeconds - state.hazardSlowSeconds);

  const duelHudInfo: DuelHudInfo = {
    player1Name,
    player2Name,
    racers: racers.map((p) => {
      const isMe = p.slot === mySlot;
      return {
        slot: p.slot,
        name: p.slot === 0 ? player1Name : player2Name,
        y: p.y,
        isMe,
        isLeader: leader !== null && p.slot === leader.slot && maxAlt > 0,
        stale: !isMe && phase === "climb" && opponentStale,
        ready: false,
      };
    }),
    maxAlt,
    phase,
    connectionState,
    opponentStale,
    opponentPresent: true,
  };

  const [joinBeat, setJoinBeat] = useState(false);
  const [liveBeat, setLiveBeat] = useState(false);
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== "countdown" && phase === "countdown") {
      setJoinBeat(true);
      const t = setTimeout(() => setJoinBeat(false), 1800);
      prevPhaseRef.current = phase;
      return () => clearTimeout(t);
    }
    if (prev !== "climb" && phase === "climb") {
      setLiveBeat(true);
      const t = setTimeout(() => setLiveBeat(false), 900);
      prevPhaseRef.current = phase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const countdownNum = Math.max(1, 3 - Math.floor(state.tick / 30));

  // Finished: show result inline
  if (finished && duelResult) {
    return (
      <MobileResult
        duelId={duelId}
        duelResult={duelResult}
        myId={myId}
        player1Id={player1Id}
        player2Id={player2Id}
        player1Name={player1Name}
        player2Name={player2Name}
        realtime={realtime}
        resultError={resultError}
        resultSource={resultSource}
        onRematch={onRematch}
        onRetrySubmit={retrySubmit}
      />
    );
  }

  if (awaitingResult && !duelResult) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-void px-4 text-center">
        <Spinner />
        <p className="font-mono text-sm text-text-secondary">Computing result&hellip;</p>
        {resultError && (
          <button
            onClick={retrySubmit}
            className="rounded-full border border-border-strong px-6 py-3 text-sm text-text-secondary active:scale-95"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-void text-text-primary">
      {/* Game canvas */}
      <div
        ref={canvasBoxRef}
        data-climb-surface
        className="exp-stage relative h-full w-full overflow-hidden"
      >
        <ClimbCanvas
          state={state}
          feed={renderFeed}
          width={canvasSize.width}
          height={canvasSize.height}
          bottomInset={bottomInset}
          fullBleed
          hudInsetTop={safeArea.top}
          includeHud={false}
          myId={myId}
          playerNames={playerNames}
        />

        <ExpeditionHud
          player={myPlayer}
          hazardY={state.hazardY}
          tick={state.tick}
          lavaPhase={lavaPhaseInfo.phase}
          lavaPhaseProgress={lavaPhaseInfo.progress}
          muted={muted}
          onToggleMute={() => setMuted(!muted)}
          announcement=""
          runId={0}
          topInset={safeArea.top}
          leftInset={safeArea.left}
          rightInset={safeArea.right}
          duel={duelHudInfo}
          backControl={
            <button
              type="button"
              data-game-control
              className="exp-utility"
              aria-label="Leave duel"
              title="Leave duel"
              onClick={handleLeave}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          }
        />

        {joinBeat && (
          <div className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center">
            <span className="rounded-full bg-void/70 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-signal backdrop-blur-sm animate-rise">
              Opponent joined
            </span>
          </div>
        )}

        {phase === "countdown" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              key={countdownNum}
              className="font-display text-8xl font-black text-signal animate-rise"
              style={{ textShadow: "0 0 40px rgb(203 242 77 / 0.5)" }}
            >
              {countdownNum}
            </div>
          </div>
        )}

        {liveBeat && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display text-7xl font-black uppercase text-ember animate-rise" style={{ textShadow: "0 0 44px rgb(255 90 44 / 0.5)" }}>
              Go
            </span>
          </div>
        )}

        {touchActive && <TouchControls active={touchActive} onInput={setTouch} />}
      </div>
    </div>
  );
}

/* ──── Result screen ─────────────────────────────────────────────────── */

function MobileResult({
  duelId,
  duelResult,
  myId,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  realtime,
  resultError,
  resultSource,
  onRematch,
  onRetrySubmit,
}: {
  duelId: string;
  duelResult: { winnerId: string | null; tiebreakRule: string | null; player1Peak: number | null; player2Peak: number | null; forfeit: boolean; hasReplay: boolean };
  myId: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  realtime: RealtimeHandle;
  resultError: boolean;
  resultSource: "provisional" | "authoritative" | null;
  onRematch: (newDuelId: string) => void;
  onRetrySubmit: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState("");
  const [rematchPending, setRematchPending] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);

  const opponentId = player1Id === myId ? player2Id : player1Id;
  const navigatedRef = useRef(false);

  const goToRematch = useCallback(
    (newDuelId: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      onRematch(newDuelId);
    },
    [onRematch],
  );

  useEffect(() => {
    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) goToRematch(msg.newDuelId);
    });
    const unsubPresence = realtime.onPresence((action, member) => {
      if (action === "leave" && member.clientId === opponentId) setOpponentLeft(true);
      if ((action === "enter" || action === "present") && member.clientId === opponentId) setOpponentLeft(false);
    });
    return () => { unsubRematch(); unsubPresence(); };
  }, [realtime, opponentId, goToRematch]);

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (navigatedRef.current) return;
      try {
        const res = await apiFetch(`/api/duel/${duelId}`);
        if (!res.ok || cancelled) return;
        const meta = (await res.json()) as { rematchDuelId?: string | null };
        if (meta.rematchDuelId) goToRematch(meta.rematchDuelId);
      } catch { /* next tick */ }
    }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [duelId, goToRematch]);

  const handleRematch = useCallback(async () => {
    if (!user) return;
    void tapMedium();
    setRematchLoading(true);
    setRematchError("");
    try {
      const res = await apiFetch(`/api/duel/${duelId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRematchError(body.error ?? "Could not start rematch.");
        setRematchLoading(false);
        return;
      }
      const body = (await res.json()) as { newDuelId: string };
      setRematchLoading(false);
      setRematchPending(true);
      void notifySuccess();
      setTimeout(() => goToRematch(body.newDuelId), 1500);
    } catch {
      setRematchError("Network error. Please try again.");
      setRematchLoading(false);
    }
  }, [duelId, user, goToRematch]);

  const handleShare = useCallback(async () => {
    void tapLight();
    const url = `${API_BASE}/duel/${duelId}`;
    await shareInvite(url, {
      title: "Doomstack — 1v1 duel",
      text: "Race me to the top.",
    });
  }, [duelId]);

  const iWon = duelResult.winnerId === myId;
  const isDraw = duelResult.winnerId === null;
  const provisional = resultSource === "provisional";

  const resultLabel = duelResult.forfeit
    ? (iWon ? "You won" : "You lost")
    : isDraw ? "Draw" : iWon ? "You won!" : "So close";

  const resultColor = duelResult.forfeit
    ? (iWon ? "text-signal" : "text-text-secondary")
    : isDraw ? "text-text-secondary" : iWon ? "text-signal" : "text-text-primary";

  const myPeak = player1Id === myId ? duelResult.player1Peak : duelResult.player2Peak;
  const theirPeak = player1Id === myId ? duelResult.player2Peak : duelResult.player1Peak;
  const margin = myPeak !== null && theirPeak !== null ? Math.abs(myPeak - theirPeak) : null;

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center overflow-hidden bg-void px-6 text-text-primary">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          match over
        </p>
        <h1 className={`mt-2 font-display text-5xl font-black uppercase tracking-tight ${resultColor}`}>
          {resultLabel}
        </h1>

        {!duelResult.forfeit && !isDraw && margin !== null && (
          <p className="mt-3 font-mono text-sm tabular-nums text-text-secondary">
            {iWon ? (
              <>Won by <span className="font-semibold text-signal">{formatAltitude(margin, 1)}</span></>
            ) : (
              <>Just <span className="font-semibold text-text-primary">{formatAltitude(margin, 1)}</span> short</>
            )}
          </p>
        )}

        {provisional && (
          <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
            <span className="h-2 w-2 animate-spin rounded-full border border-text-muted border-t-signal" />
            Confirming result&hellip;
          </p>
        )}
      </div>

      {/* Player peaks */}
      <div className="mt-5 w-full max-w-xs rounded-2xl border border-border-subtle bg-surface p-4">
        <PlayerRow name={player1Name} peak={duelResult.player1Peak} isWinner={duelResult.winnerId === player1Id} isLocal={player1Id === myId} color="signal" />
        <div className="my-3 h-px bg-border-subtle" />
        <PlayerRow name={player2Name} peak={duelResult.player2Peak} isWinner={duelResult.winnerId === player2Id} isLocal={player2Id === myId} color="blue" />
      </div>

      {opponentLeft && (
        <div className="mt-3 w-full max-w-xs rounded-2xl border border-border-subtle bg-surface px-4 py-2 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            Opponent has left
          </p>
        </div>
      )}

      {resultError && (
        <div className="mt-3 w-full max-w-xs rounded-2xl border border-ember/40 bg-surface px-4 py-3 text-center">
          <p className="mb-2 text-sm text-ember">We couldn&apos;t save this result.</p>
          <button
            onClick={onRetrySubmit}
            className="rounded-full border border-border-strong px-5 py-2 text-sm text-text-secondary active:scale-95"
          >
            Retry saving
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2.5">
        {rematchPending ? (
          <div className="flex items-center justify-center gap-2 rounded-full border border-signal/40 bg-surface px-6 py-3.5 text-sm text-text-secondary">
            <Spinner size="sm" />
            Waiting for opponent&hellip;
          </div>
        ) : (
          <button
            onClick={handleRematch}
            disabled={rematchLoading || !user || opponentLeft}
            className="w-full rounded-full bg-signal py-4 font-display text-base font-black uppercase tracking-widest text-void transition-transform active:scale-95 disabled:opacity-50"
          >
            {rematchLoading ? <Spinner size="sm" /> : "Rematch"}
          </button>
        )}

        {rematchError && (
          <p className="text-center text-xs text-ember">{rematchError}</p>
        )}

        {!user && !opponentLeft && (
          <p className="text-center text-xs text-text-muted">
            <button onClick={() => navigate("/signin")} className="text-signal underline underline-offset-2">Sign in</button>{" "}
            to rematch.
          </p>
        )}

        <button
          onClick={handleShare}
          className="w-full rounded-full border border-border-strong py-3.5 font-display text-sm font-bold uppercase tracking-widest text-text-primary transition-transform active:scale-95"
        >
          Share
        </button>

        <button
          onClick={() => { void tapLight(); navigate("/"); }}
          className="py-3 font-mono text-xs uppercase tracking-[0.12em] text-text-muted"
        >
          Play again
        </button>
      </div>
    </div>
  );
}

function PlayerRow({
  name,
  peak,
  isWinner,
  isLocal,
  color,
}: {
  name: string;
  peak: number | null;
  isWinner: boolean;
  isLocal: boolean;
  color: "signal" | "blue";
}) {
  const nameColor = color === "signal" ? "text-signal" : "text-[#6bb8ff]";
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {isWinner && <span className="font-mono text-xs text-signal">&#9733;</span>}
        <span className={`truncate font-mono text-sm font-semibold ${nameColor}`}>
          {name}
          {isLocal && <span className="ml-1 font-mono text-xs text-text-muted">(you)</span>}
        </span>
      </div>
      <span className="font-mono text-sm tabular-nums text-text-primary">
        {peak !== null ? formatAltitude(peak, 1) : "&mdash;"}
      </span>
    </div>
  );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <span className={`inline-block ${dim} animate-spin rounded-full border-2 border-text-muted border-t-signal`} />
  );
}
