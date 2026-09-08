"use client";

/**
 * /duel/[id] room — orchestrates the full match lifecycle.
 * Lobby → Countdown → Live race → Finished → Result
 *
 * Lifecycle:
 *   1. Fetch duel metadata. If pending, POST /join first.
 *   2. Connect Ably. Subscribe to control events + presence, then enter presence.
 *   3. Slot-0 (coordinator) waits until both players are present, then publishes
 *      "start" (re-broadcast a few times for reliability).
 *   4. On "start" → call useDuel.start() → countdown → climb.
 *   5. On finish → show DuelResult.
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
import { buildTower } from "../../game/towers";
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
  | "countdown"       // sim running countdown
  | "climb"           // live race
  | "finished"        // match over
  | "error";

interface DuelRoomProps {
  duelId: string;
}

// ─────────────────────────────── Practice lobby ───────────────────────────

/**
 * Warm-up solo climb shown while waiting for the opponent to join.
 * Runs on a fresh random seed (never the duel seed — no pre-scouting).
 * Tear it down by unmounting (parent replaces it on duel start).
 */
function PracticeGame({
  categorySlug,
  linkCopied,
  waitedTooLong,
  onCopyLink,
  onLeave,
}: {
  categorySlug: string;
  linkCopied: boolean;
  waitedTooLong: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
}) {
  // Same tower archetype as the real duel category, but with NO seed lock so
  // useClimb rolls a fresh random map each run — a representative warm-up that
  // never reveals the duel's actual layout (no pre-scouting the real seed).
  const [tower] = useState(() => buildTower(categorySlug));

  const { state, start, finished } = useClimb({ tower });

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
  categorySlug: string;
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
  categorySlug,
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
  // Canonical tower for this category — useDuel applies the run seed internally,
  // producing a tower bit-identical to the server's simulateDuel re-sim
  // (buildTower(categorySlug, { runSeed: seed })). Anything else diverges and
  // gets cheat-flagged.
  const [tower] = useState(() => buildTower(categorySlug));

  // Populated after useDuel returns (it needs forfeit/opponentForfeited). Held in
  // a ref so the stable onStallCeiling callback below can reach the latest one.
  const resolveStallRef = useRef<() => void>(() => {});

  const {
    state,
    start,
    finished,
    stalling,
    setTouch: _setTouch,
    duelResult,
    forfeit,
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
    // Resolve a long stall by presence rather than always self-losing: if the
    // opponent is truly gone we WIN; if they're still in Ably presence (a real
    // desync) we drop. Removes the dependence on the stall ceiling racing the
    // presence-leave timeout.
    onStallCeiling: () => resolveStallRef.current(),
  });

  // Presence-gated stall resolution (see onStallCeiling above).
  useEffect(() => {
    resolveStallRef.current = () => {
      void (async () => {
        const members = await realtime.getPresence().catch(() => []);
        const opponentPresent = members.some((m) => m.clientId !== myId);
        if (opponentPresent) forfeit(); // both here but desynced → we drop
        else opponentForfeited(); // opponent abandoned → we win
      })();
    };
  }, [realtime, myId, forfeit, opponentForfeited]);

  const { token } = useAuth();
  const router = useRouter();

  const startedRef = useRef(false);
  const [connectionState, setConnectionState] = useState<string>("connected");
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Handshake (presence-authoritative):
  // - Subscribe to control events + presence BEFORE announcing ourselves, so we
  //   can never miss the coordinator's "start" (Ably does not replay channel
  //   messages to subscribers that attach after publish).
  // - Slot-0 is the coordinator: once BOTH players are present it publishes
  //   "start" and begins locally. Presence is Ably's reliable synced primitive,
  //   so readiness is gated on it rather than on echo-prone "ready" counters.
  useEffect(() => {
    let disposed = false;

    const beginMatch = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      stopPoll();
      start();
    };

    // A presence "leave" can fire on a transient Ably blip or a phone briefly
    // backgrounding the tab, so don't award the win instantly — wait a while and
    // re-check presence; a real departure stays gone, a blip/return re-enters and
    // clears this timer. (The explicit "forfeit" event below is the fast,
    // unambiguous path for an intentional leave / tab close.)
    const LEAVE_GRACE_MS = 12_000;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLeaveTimer = () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
    };

    // Coordinator re-broadcasts "start" (~6 publishes over ~2s) so a single
    // dropped packet can't strand the opponent; the receiver is idempotent.
    let rebroadcasts = 0;
    let rebroadcastTimer: ReturnType<typeof setInterval> | null = null;
    const stopRebroadcast = () => {
      if (rebroadcastTimer) {
        clearInterval(rebroadcastTimer);
        rebroadcastTimer = null;
      }
    };

    // Both slots poll presence as a safety net against a stale presence read or
    // a missed "enter" event, until the match starts.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function stopPoll() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    // Slot-1 fallback: if both players have been present this long without a
    // "start" arriving (i.e. every coordinator broadcast dropped), begin anyway
    // rather than dead-end in the lobby. Generous so it never fires in normal
    // operation (start arrives in well under a second); the countdown absorbs the
    // small resulting offset.
    const SLOT1_FALLBACK_MS = 5000;
    let bothPresentSince = 0;

    const evaluateStart = async () => {
      if (startedRef.current || disposed) return;
      const members = await realtime.getPresence().catch(() => []);
      if (disposed || startedRef.current) return;
      // Count presence ENTRIES, not distinct clientIds: Ably returns one entry
      // per connection, so two participants = two entries even when they share a
      // clientId (e.g. two tabs on the same account, or same-account testing).
      // Deduping by clientId would collapse that to 1 and hang the lobby forever.
      if (members.length < 2) {
        bothPresentSince = 0; // opponent not present yet
        return;
      }

      if (mySlot === 0) {
        // Coordinator: set the local guard first, then tell the opponent
        // (retrying briefly so a dropped "start" can't strand them).
        beginMatch();
        realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        stopRebroadcast();
        rebroadcasts = 0;
        rebroadcastTimer = setInterval(() => {
          rebroadcasts += 1;
          if (disposed || rebroadcasts > 5) {
            stopRebroadcast();
            return;
          }
          realtime.publishEvent({ type: "start", serverTimestamp: Date.now() });
        }, 400);
      } else {
        // Slot-1 normally begins on the "start" event; this is only the
        // all-broadcasts-dropped rescue.
        if (bothPresentSince === 0) bothPresentSince = Date.now();
        else if (Date.now() - bothPresentSince >= SLOT1_FALLBACK_MS) beginMatch();
      }
    };

    // 1) Subscribe first — before we enter presence.
    const unsubStart = realtime.onEvent("start", () => beginMatch());

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
      if (member.clientId !== myId) clearLeaveTimer(); // opponent (re)appeared
      evaluateStart(); // fast path
    });

    // 2) Announce ourselves.
    realtime.enterPresence({
      uid: myId,
      displayName: mySlot === 0 ? player1Name : player2Name,
      slot: mySlot,
    });

    // 3) Kick off immediately (covers the already-present opponent) and then
    //    poll until the match starts — coordinator elects/broadcasts start,
    //    slot-1 uses it as the dropped-broadcast rescue.
    evaluateStart();
    pollTimer = setInterval(evaluateStart, 600);

    // beforeunload: publish forfeit on disconnect
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
          categorySlug={categorySlug}
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
      categorySlug={meta.categorySlug}
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
