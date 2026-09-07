"use client";

/**
 * /duel/[id] room — orchestrates the full match lifecycle.
 * Lobby → Countdown → Live race → Finished → Result
 *
 * Lifecycle:
 *   1. Fetch duel metadata. If pending, POST /join first.
 *   2. Connect Ably. Enter presence.
 *   3. Wait for both players in presence → each publishes "ready".
 *   4. Slot-0 waits for two "ready" events → publishes "start".
 *   5. On "start" → call useDuel.start() → countdown → climb.
 *   6. On finish → show DuelResult.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useDuel } from "../../game/useDuel";
import { ClimbCanvas } from "../Game/ClimbCanvas";
import { DuelResult } from "./DuelResult";
import { connectRealtime, RealtimeHandle } from "../../net/realtime";
import { TowerSpec } from "../../game/types";
import { formatAltitude } from "../../lib/units";

// ─────────────────────────────── Types ────────────────────────────────────

interface DuelMeta {
  id: string;
  status: string;
  seed: string;
  categorySlug: string;
  /** Server-resolved identity of the caller (uid or guest:<ip>). */
  youId: string;
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
  | "ready_handshake" // both present, exchanging ready signals
  | "countdown"       // sim running countdown
  | "climb"           // live race
  | "finished"        // match over
  | "error";

interface DuelRoomProps {
  duelId: string;
}

// Default tower spec — the actual seed gets applied in useDuel via applyRunSeed
const DEFAULT_TOWER: TowerSpec = {
  categorySlug: "tech",
  widthM: 100,
  floorGap: 4,
  seed: "default",
  ladderGrabRadius: 2.5,
  maxClimbSpeed: 12,
  moveSpeed: 8,
  jumpSpeed: 14,
  gravity: 32,
  fallDeathBelowPeakM: 10,
};

// ─────────────────────────────── Inner game component ─────────────────────

interface GameProps {
  duelId: string;
  seed: string;
  myId: string;
  opponentId: string;
  mySlot: 0 | 1;
  realtime: RealtimeHandle;
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  onRematch: (newDuelId: string) => void;
}

function DuelGame({
  duelId,
  seed,
  myId,
  opponentId,
  mySlot,
  realtime,
  player1Name,
  player2Name,
  player1Id,
  player2Id,
  onRematch,
}: GameProps) {
  const tower: TowerSpec = { ...DEFAULT_TOWER, seed };

  const {
    state,
    start,
    finished,
    stalling,
    setTouch: _setTouch,
    duelResult,
    opponentForfeited,
    resultError,
    retrySubmit,
  } = useDuel({
    tower,
    seed,
    myId,
    opponentId,
    mySlot,
    realtime,
    duelId,
  });

  const startedRef = useRef(false);
  const readyCountRef = useRef(0);
  const [connectionState, setConnectionState] = useState<string>("connected");
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Handshake:
  // - Enter presence
  // - Publish "ready" once both players are in presence
  // - Slot-0 publishes "start" once it has seen two "ready" events
  useEffect(() => {
    realtime.enterPresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
    });

    // Watch for both players in presence.
    // Track whether we have already published "ready" so we don't double-count
    // our own event (the initial-check block below may have already fired it).
    let selfReadyPublished = false;
    const publishSelfReady = () => {
      if (selfReadyPublished) return;
      selfReadyPublished = true;
      realtime.publishEvent({ type: "ready", slot: mySlot });
      // Count our own "ready" locally — the broker may deliver it after
      // onEvent("ready") is subscribed, but if not we would deadlock.
      readyCountRef.current += 1;
      if (mySlot === 0 && readyCountRef.current >= 2 && !startedRef.current) {
        startedRef.current = true;
        realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        start();
      }
    };

    const unsubPresence = realtime.onPresence(async (action, member) => {
      if (action === "leave" || action === "absent") {
        // The opponent dropped. If the match has started, we win by forfeit
        // immediately instead of waiting out the 3s stall clock. (Ignore our
        // own leave and any pre-start churn.)
        if (member.clientId !== myId && startedRef.current) {
          opponentForfeited();
        }
        return;
      }
      if (action !== "enter" && action !== "present") return;
      const members = await realtime.getPresence();
      if (members.length >= 2) {
        publishSelfReady();
      }
    });

    // Check initial presence (may already have 2 members if late joiner).
    realtime.getPresence().then((members) => {
      if (members.length >= 2) {
        publishSelfReady();
      }
    });

    const unsubReady = realtime.onEvent("ready", () => {
      readyCountRef.current += 1;
      // Slot-0 is the match coordinator
      if (mySlot === 0 && readyCountRef.current >= 2 && !startedRef.current) {
        startedRef.current = true;
        realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        start();
      }
    });

    const unsubStart = realtime.onEvent("start", () => {
      if (!startedRef.current) {
        startedRef.current = true;
        start();
      }
    });

    // Opponent forfeited (explicit leave / beforeunload) — we win immediately,
    // no need to wait for the stall clock.
    const unsubForfeit = realtime.onEvent("forfeit", () => {
      opponentForfeited();
    });

    // Handle rematch
    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) {
        onRematch(msg.newDuelId);
      }
    });

    // beforeunload: publish forfeit on disconnect
    const handleBeforeUnload = () => {
      realtime.publishEvent({ type: "forfeit", slot: mySlot, reason: "disconnect" });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      unsubPresence();
      unsubReady();
      unsubStart();
      unsubForfeit();
      unsubRematch();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [realtime, myId, mySlot, player1Name, player2Name, start, onRematch, opponentForfeited]);

  // Surface connection health so a blip reads as "reconnecting", not a freeze.
  useEffect(() => {
    const unsub = realtime.onConnectionState((s) => setConnectionState(s));
    return unsub;
  }, [realtime]);

  // Lobby timeout: if the match hasn't started after a while, the opponent
  // probably isn't coming (or this is an un-resumable reload). Offer a way out
  // instead of an indefinite spinner.
  useEffect(() => {
    if (state.phase !== "lobby") return;
    const t = setTimeout(() => {
      if (!startedRef.current) setWaitedTooLong(true);
    }, 75_000);
    return () => clearTimeout(t);
  }, [state.phase]);

  const copyInviteLink = useCallback(async () => {
    const url = `${window.location.origin}/duel/${duelId}`;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "1v1 duel", url });
        return;
      }
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Last-resort fallback: prompt so the link is always obtainable.
      window.prompt("Copy this duel link:", url);
    }
  }, [duelId]);

  const playerNames: Record<string, string> = {
    [player1Id]: player1Name,
    [player2Id]: player2Name,
  };

  // Local player altitude
  const localPlayer = state.players.find((p) => p.id === myId) ?? state.players[0];
  const opponentPlayer = state.players.find((p) => p.id === opponentId);
  const localAlt = localPlayer?.y ?? 0;
  const opponentAlt = opponentPlayer?.y ?? 0;

  const phase = state.phase;

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
      />
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-void text-text-primary">
      {/* HUD bar */}
      <div className="w-full max-w-md flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
        <div className="font-mono text-xs tabular-nums">
          <span className="text-signal">{player1Name}</span>
          <span className="text-text-muted mx-1">vs</span>
          <span className="text-[#6bb8ff]">{player2Name}</span>
        </div>
        <div className="flex items-center gap-2">
          {(connectionState === "disconnected" ||
            connectionState === "suspended" ||
            connectionState === "connecting") && (
            <span className="font-mono text-xs text-warning animate-pulse">
              reconnecting…
            </span>
          )}
          {stalling && connectionState === "connected" && (
            <span className="font-mono text-xs text-warning animate-pulse">
              syncing...
            </span>
          )}
          {phase === "climb" && (
            <span className="flex items-center gap-1 font-mono text-xs text-ember">
              <span className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse" aria-hidden="true" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Altitude readouts */}
      {(phase === "climb" || phase === "countdown") && (
        <div className="w-full max-w-md flex justify-between px-4 py-2 bg-surface-raised border-b border-border-subtle font-mono text-xs tabular-nums">
          <span className="text-signal">
            {player1Name}: {formatAltitude(mySlot === 0 ? localAlt : opponentAlt, 1)}
          </span>
          <span className="text-[#6bb8ff]">
            {player2Name}: {formatAltitude(mySlot === 0 ? opponentAlt : localAlt, 1)}
          </span>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1 flex items-start justify-center pt-4">
        <ClimbCanvas
          state={state}
          width={360}
          height={600}
          myId={myId}
          playerNames={playerNames}
        />

        {/* Countdown overlay */}
        {phase === "countdown" && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-live="assertive"
            aria-atomic="true"
          >
            <div className="font-display text-8xl font-black text-signal"
              style={{ textShadow: "0 0 40px rgb(203 242 77 / 0.5)" }}>
              {Math.max(1, 3 - Math.floor(state.tick / 30))}
            </div>
          </div>
        )}

        {/* Waiting overlay */}
        {(phase === "lobby") && !startedRef.current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void/85 backdrop-blur-sm px-6 text-center">
            {!waitedTooLong ? (
              <>
                <div className="w-6 h-6 rounded-full border-2 border-text-muted border-t-signal animate-spin" aria-hidden="true" />
                <p className="font-mono text-sm text-text-secondary">
                  Waiting for opponent…
                </p>
                <button
                  onClick={copyInviteLink}
                  className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
                >
                  {linkCopied ? "Link copied!" : "Copy invite link"}
                </button>
              </>
            ) : (
              <>
                <p className="font-mono text-sm text-text-secondary">
                  Your opponent hasn&apos;t joined yet.
                </p>
                <div className="flex flex-col gap-2 items-center">
                  <button
                    onClick={copyInviteLink}
                    className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 transition"
                  >
                    {linkCopied ? "Link copied!" : "Copy invite link"}
                  </button>
                  <Link
                    href="/duel"
                    className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
                  >
                    Back to duels
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── Room orchestrator ────────────────────────

export function DuelRoom({ duelId }: DuelRoomProps) {
  const { user, token } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<RoomPhase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [meta, setMeta] = useState<DuelMeta | null>(null);
  const [realtime, setRealtime] = useState<RealtimeHandle | null>(null);
  const [myId, setMyId] = useState<string>("");
  const [mySlot, setMySlot] = useState<0 | 1>(0);

  const realtimeRef = useRef<RealtimeHandle | null>(null);

  // Cleanup realtime on unmount
  useEffect(() => {
    return () => {
      realtimeRef.current?.dispose();
    };
  }, []);

  // Load duel and connect
  useEffect(() => {
    let cancelled = false;

    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    async function init() {
      // Fetch duel metadata (auth header lets the server resolve our identity).
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

      // The server resolves our stable identity (uid or guest:<ip>). Use it for
      // slot detection + Ably clientId so guests match the duel row.
      let localId = duelMeta.youId;

      // Reload after the match already ended → don't drop into an un-startable
      // lobby; show a clear terminal state.
      if (duelMeta.status === "completed" || duelMeta.status === "voided") {
        setErrorMsg("This duel has already ended.");
        setPhase("error");
        return;
      }

      // If pending and we're not player1, join as player2
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
            // Already active — re-fetch meta with seed
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
          if (joinBody.youId) localId = joinBody.youId;
          // Merge seed and names into meta
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

      // Re-fetch to get seed if still missing
      if (!finalMeta.seed) {
        const refetch = await fetch(`/api/duel/${duelId}`, { headers: authHeaders });
        if (refetch.ok) finalMeta = (await refetch.json()) as DuelMeta;
      }

      if (!finalMeta.seed) {
        setErrorMsg("Could not load duel seed.");
        setPhase("error");
        return;
      }

      setMyId(localId);
      setMeta(finalMeta);

      // Determine slot
      const slot: 0 | 1 = finalMeta.player1?.id === localId ? 0 : 1;
      setMySlot(slot);

      // Connect Ably
      try {
        const handle = await connectRealtime(duelId, localId);
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
  }, [duelId, user, token]);

  const handleRematch = useCallback(
    (newDuelId: string) => {
      router.push(`/duel/${newDuelId}`);
    },
    [router]
  );

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-text-muted border-t-signal animate-spin" aria-hidden="true" />
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
        <div className="w-8 h-8 rounded-full border-2 border-text-muted border-t-signal animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const opponentId =
    mySlot === 0
      ? (meta.player2?.id ?? "opponent")
      : (meta.player1?.id ?? "opponent");

  const player1Name = meta.player1?.displayName ?? "Player 1";
  const player2Name = meta.player2?.displayName ?? "Player 2";
  const player1Id = meta.player1?.id ?? "";
  const player2Id = meta.player2?.id ?? myId;

  return (
    <DuelGame
      duelId={duelId}
      seed={meta.seed}
      myId={myId}
      opponentId={opponentId}
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
