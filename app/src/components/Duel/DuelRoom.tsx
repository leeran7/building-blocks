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

    const unsubPresence = realtime.onPresence(async (action) => {
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

    // Handle forfeit from opponent
    const unsubForfeit = realtime.onEvent("forfeit", () => {
      // The sim will detect the stall and call forfeit on our side too,
      // but we can also surface the result immediately.
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
  }, [realtime, myId, mySlot, player1Name, player2Name, start, onRematch]);

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
          {stalling && (
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/80 backdrop-blur-sm pointer-events-none">
            <div className="w-6 h-6 rounded-full border-2 border-text-muted border-t-signal animate-spin mb-4" aria-hidden="true" />
            <p className="font-mono text-sm text-text-secondary">
              Waiting for opponent...
            </p>
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

    async function init() {
      // Determine local user id
      const localId = user?.uid ?? `guest:${Math.random().toString(36).slice(2)}`;
      setMyId(localId);

      // Fetch duel metadata
      const metaRes = await fetch(`/api/duel/${duelId}`);
      if (!metaRes.ok) {
        if (cancelled) return;
        const body = (await metaRes.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(body.error ?? "Duel not found.");
        setPhase("error");
        return;
      }

      const duelMeta = (await metaRes.json()) as DuelMeta;
      if (cancelled) return;

      // If pending and we're not player1, join as player2
      let finalMeta = duelMeta;
      if (duelMeta.status === "pending" && duelMeta.player1?.id !== localId) {
        const joinRes = await fetch(`/api/duel/${duelId}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
        });

        if (!joinRes.ok) {
          if (cancelled) return;
          const body = (await joinRes.json().catch(() => ({}))) as { error?: string; code?: string };
          if (body.code === "DUEL_NOT_PENDING") {
            // Already active — re-fetch meta with seed
            const refetch = await fetch(`/api/duel/${duelId}`);
            if (refetch.ok) finalMeta = (await refetch.json()) as DuelMeta;
          } else {
            setErrorMsg(body.error ?? "Could not join duel.");
            setPhase("error");
            return;
          }
        } else {
          const joinBody = (await joinRes.json()) as {
            seed: string;
            player1DisplayName: string | null;
            player2DisplayName: string | null;
          };
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
        const refetch = await fetch(`/api/duel/${duelId}`);
        if (refetch.ok) finalMeta = (await refetch.json()) as DuelMeta;
      }

      if (!finalMeta.seed) {
        setErrorMsg("Could not load duel seed.");
        setPhase("error");
        return;
      }

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
