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
import { useClimb } from "../../game/useClimb";
import { ClimbCanvas } from "../Game/ClimbCanvas";
import { DuelResult } from "./DuelResult";
import { connectRealtime, RealtimeHandle } from "../../net/realtime";
import { TowerSpec } from "../../game/types";
import { formatAltitude } from "../../lib/units";
import { newRunSeed } from "../../game/rng";

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

// ─────────────────────────────── Practice lobby ───────────────────────────

/**
 * Warm-up solo climb shown while waiting for the opponent to join.
 * Runs on a fresh random seed (never the duel seed — no pre-scouting).
 * Tear it down by unmounting (parent replaces it on duel start).
 */
function PracticeGame({
  linkCopied,
  waitedTooLong,
  onCopyLink,
  onLeave,
}: {
  linkCopied: boolean;
  waitedTooLong: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
}) {
  const [warmSeed] = useState(() => newRunSeed());
  const tower: TowerSpec = { ...DEFAULT_TOWER, seed: warmSeed };

  const { state, start, finished } = useClimb({
    tower,
    seed: warmSeed,
  });

  // Start on mount and restart when the warm-up run ends
  useEffect(() => { start(); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (finished) start();
  }, [finished, start]);

  return (
    <div className="relative flex-1 flex items-start justify-center pt-4">
      {/* Warm-up canvas (solo, throwaway) */}
      <ClimbCanvas state={state} width={360} height={600} />

      {/* Waiting HUD overlay */}
      <div className="absolute inset-0 flex flex-col items-end justify-start p-4 gap-2 pointer-events-none">
        <div className="bg-void/80 backdrop-blur-sm rounded-xl border border-border-subtle px-3 py-2 pointer-events-auto max-w-[200px]">
          {!waitedTooLong ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border-2 border-text-muted border-t-signal animate-spin shrink-0"
                  aria-hidden="true"
                />
                <p className="font-mono text-xs text-text-secondary">
                  Waiting for opponent…
                </p>
              </div>
              <button
                onClick={onCopyLink}
                className="inline-flex items-center justify-center rounded-full px-3 min-h-[36px] border border-border-strong text-text-secondary text-xs hover:border-signal/50 transition-colors w-full"
              >
                {linkCopied ? "Copied!" : "Copy invite link"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="font-mono text-xs text-text-secondary">
                Opponent hasn&apos;t joined yet.
              </p>
              <button
                onClick={onCopyLink}
                className="inline-flex items-center justify-center rounded-full px-3 min-h-[36px] bg-signal text-void font-semibold text-xs hover:brightness-110 transition w-full"
              >
                {linkCopied ? "Copied!" : "Copy invite link"}
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
        <p className="font-mono text-[10px] text-text-muted bg-void/70 rounded px-2 py-1 pointer-events-none">
          warm-up • not ranked
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────── Inner game component ─────────────────────

interface GameProps {
  duelId: string;
  seed: string;
  myId: string;
  guestId: string | null;
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
  guestId,
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
    guestId,
  });

  const { token } = useAuth();
  const router = useRouter();

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

    // A presence "leave" can fire on a transient Ably blip, so don't award the
    // win instantly — wait a few seconds and re-check presence; a real departure
    // stays gone, a blip re-enters. (The explicit "forfeit" event below is the
    // fast, unambiguous path.)
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLeaveTimer = () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
    };

    const unsubPresence = realtime.onPresence(async (action, member) => {
      if (action === "leave" || action === "absent") {
        if (member.clientId === myId || !startedRef.current) return;
        clearLeaveTimer();
        leaveTimer = setTimeout(async () => {
          const members = await realtime.getPresence().catch(() => []);
          const opponentStillHere = members.some((m) => m.clientId !== myId);
          if (!opponentStillHere) opponentForfeited();
        }, 5000);
        return;
      }
      if (action !== "enter" && action !== "present") return;
      if (member.clientId !== myId) clearLeaveTimer(); // opponent (re)appeared
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
      clearLeaveTimer();
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

  // Leaving the waiting lobby must cancel the still-pending challenge, otherwise
  // the creator's one-open-challenge slot is stranded and the next "Create
  // challenge" is blocked by the 409 guard. Best-effort: only the creator (slot 0)
  // can cancel a pending duel; navigate away regardless of the DELETE outcome.
  const handleLeave = useCallback(async () => {
    if (mySlot === 0) {
      try {
        await fetch(`/api/duel/${duelId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Ignore — the lobby is being abandoned either way.
      }
    }
    router.push("/duel");
  }, [mySlot, duelId, token, router]);

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
        hasReplay={duelResult.hasReplay}
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

      {/* Canvas / Lobby */}
      {phase === "lobby" && !startedRef.current ? (
        <PracticeGame
          linkCopied={linkCopied}
          waitedTooLong={waitedTooLong}
          onCopyLink={copyInviteLink}
          onLeave={handleLeave}
        />
      ) : (
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
        </div>
      )}
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
  /** Opaque guest token when the local player is an unauthenticated guest. */
  const [myGuestId, setMyGuestId] = useState<string | null>(null);

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

      // Identity: a signed-in user is their uid; a guest uses the opaque token
      // issued at join (persisted per-duel so a reload re-presents it). Player1
      // is always authenticated (create/queue require auth), so only a joiner
      // can be a guest.
      const guestKey = `duel-guest:${duelId}`;
      let guestToken: string | null = user?.uid
        ? null
        : typeof window !== "undefined"
          ? window.sessionStorage.getItem(guestKey)
          : null;
      let localId = user?.uid ?? guestToken ?? "";

      // Reload after the match already ended → don't drop into an un-startable
      // lobby; show a clear terminal state.
      if (duelMeta.status === "completed" || duelMeta.status === "voided") {
        setErrorMsg("This duel has already ended.");
        setPhase("error");
        return;
      }

      // If pending and we're not already player1, join as player2.
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
          if (joinBody.youId) {
            localId = joinBody.youId;
            // Persist a freshly-issued guest token so a reload re-identifies us.
            if (!user?.uid && localId.startsWith("guest:") && typeof window !== "undefined") {
              guestToken = localId;
              window.sessionStorage.setItem(guestKey, localId);
            }
          }
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

      // A guest who couldn't establish an identity (e.g. reload with no stored
      // token on an active duel they never joined) cannot participate.
      if (!localId) {
        setErrorMsg("This duel is no longer open to join.");
        setPhase("error");
        return;
      }

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
      setMyGuestId(guestToken);
      setMeta(finalMeta);

      // Determine slot
      const slot: 0 | 1 = finalMeta.player1?.id === localId ? 0 : 1;
      setMySlot(slot);

      // Connect Ably (guests present their opaque token for the capability token)
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
      guestId={myGuestId}
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
