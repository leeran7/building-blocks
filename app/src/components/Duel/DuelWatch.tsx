"use client";

/**
 * DuelWatch — head-to-head replay viewer.
 *
 * Fetches decoded input logs from GET /api/duel/[id]/replay, then drives a
 * rAF loop that feeds both logs into stepMatch tick by tick, rendering the
 * result with ClimbCanvas (both climbers visible, same tower as the live match).
 *
 * Controls: auto-plays on load; "Watch again" restarts; copy-link button.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Navbar } from "../Navbar";
import { ClimbCanvas } from "../Game/ClimbCanvas";
import { FullscreenButton } from "../Game/FullscreenButton";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFullscreen } from "../../hooks/useFullscreen";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../game/simulation";
import { buildTower } from "../../game/towers";
import { buildDuelWatchUrl } from "../../game/runReplay";
import { formatAltitude } from "../../lib/units";
import type { MatchState, PlayerInput } from "../../game/types";

// ─────────────────────────────── Types ────────────────────────────────────

interface PlayerInfo {
  id: string;
  displayName: string | null;
  peak: number | null;
}

interface ReplayData {
  seed: string;
  categorySlug: string;
  player1: PlayerInfo | null;
  player2: PlayerInfo | null;
  log1: PlayerInput[] | null;
  log2: PlayerInput[] | null;
  winnerId: string | null;
  tiebreakRule: string | null;
  forfeit: boolean;
}

type WatchPhase = "loading" | "ready" | "playing" | "done" | "error";

const TICK_DT_MS = (1 / 30) * 1000;

// ─────────────────────────────── Component ────────────────────────────────

export function DuelWatch({ duelId }: { duelId: string }) {
  const [watchPhase, setWatchPhase] = useState<WatchPhase>("loading");
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const stateRef = useRef<MatchState | null>(null);
  const rafRef = useRef(0);
  const accRef = useRef(0);
  const lastTsRef = useRef(0);
  const tickRef = useRef(0);
  const playingRef = useRef(false);

  // Responsive stage so the replay canvas fills the column (and the screen in
  // full screen) instead of a fixed 360×600 box.
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const {
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen(sceneRef);
  // Cap the width to the column normally; let it fill the screen in fullscreen.
  const canvasSize = useCanvasSize(canvasBoxRef, {
    maxWidth: isFullscreen ? undefined : 420,
  });
  // Kill page scroll while the replay is actively playing.
  useBodyScrollLock(isFullscreen || watchPhase === "playing");

  // Fetch replay data on mount
  useEffect(() => {
    fetch(`/api/duel/${duelId}/replay`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Replay not found");
        }
        return r.json() as Promise<ReplayData>;
      })
      .then((data) => {
        setReplayData(data);
        setWatchPhase("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Could not load replay");
        setWatchPhase("error");
      });
  }, [duelId]);

  const buildInitialState = useCallback(
    (data: ReplayData): MatchState => {
      // Canonical tower for this category + run seed — identical to the tower
      // the live match and the server's simulateDuel used, so playback matches.
      const tower = buildTower(data.categorySlug, { runSeed: data.seed });
      const playerIds = [
        data.player1?.id ?? "player1",
        data.player2?.id ?? "player2",
      ];
      const m = createMatch({
        seed: data.seed,
        mode: "multiplayer",
        tower,
        playerIds,
      });
      m.phase = "countdown";
      m.tick = 0;
      return m;
    },
    []
  );

  const startPlayback = useCallback(
    (data: ReplayData) => {
      cancelAnimationFrame(rafRef.current);
      const initial = buildInitialState(data);
      stateRef.current = initial;
      setState(initial);
      accRef.current = 0;
      lastTsRef.current = 0;
      tickRef.current = 0;
      playingRef.current = true;
      setWatchPhase("playing");

      const NO_INPUT: PlayerInput = { moveX: 0, jump: false, climbY: 0, usePowerUp: false };
      const p1Id = data.player1?.id ?? "player1";
      const p2Id = data.player2?.id ?? "player2";
      const log1 = data.log1 ?? [];
      const log2 = data.log2 ?? [];

      // Countdown ticks before climb inputs start (mirrors useDuel)
      const COUNTDOWN_TICKS = 90;

      const loop = (ts: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (!playingRef.current) return;

        if (lastTsRef.current === 0) lastTsRef.current = ts;
        let dt = (ts - lastTsRef.current) / 1000;
        lastTsRef.current = ts;
        if (dt > 0.25) dt = 0.25;
        accRef.current += dt * 1000;

        let cur = stateRef.current!;
        let advanced = false;

        while (accRef.current >= TICK_DT_MS) {
          accRef.current -= TICK_DT_MS;

          if (cur.phase === "countdown") {
            cur = stepMatch(cur, {}, DEFAULT_SIM_CONFIG);
            advanced = true;
          } else if (cur.phase === "climb") {
            const climbTick = tickRef.current;
            tickRef.current++;

            const i1 = log1[climbTick] ?? NO_INPUT;
            const i2 = log2[climbTick] ?? NO_INPUT;
            const inputMap: Record<string, PlayerInput> = {};
            inputMap[p1Id] = i1;
            inputMap[p2Id] = i2;

            cur = stepMatch(cur, inputMap, DEFAULT_SIM_CONFIG);
            advanced = true;
          }

          if (cur.phase === "finished" || cur.phase === "results") {
            playingRef.current = false;
            stateRef.current = cur;
            setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
            setWatchPhase("done");
            return;
          }

          // Stop when we've exhausted both logs
          const climbTick = tickRef.current;
          if (cur.phase === "climb" && climbTick > log1.length && climbTick > log2.length) {
            playingRef.current = false;
            stateRef.current = cur;
            setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
            setWatchPhase("done");
            return;
          }
        }

        if (advanced) {
          stateRef.current = cur;
          setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
        }
      };

      rafRef.current = requestAnimationFrame(loop);
    },
    [buildInitialState]
  );

  // Auto-start when ready
  useEffect(() => {
    if (watchPhase === "ready" && replayData) {
      startPlayback(replayData);
    }
  }, [watchPhase, replayData, startPlayback]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleWatchAgain = useCallback(() => {
    if (replayData) {
      setWatchPhase("ready");
    }
  }, [replayData]);

  const handleCopyLink = useCallback(async () => {
    const url = buildDuelWatchUrl(duelId, window.location.origin);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Doomstack — duel replay", url });
        return;
      }
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Copy this replay link:", url);
    }
  }, [duelId]);

  // ─────────────── Render states ────────────────

  if (watchPhase === "loading") {
    return (
      <div className="min-h-screen bg-void text-text-primary">
        <Navbar contextLabel="1v1" />
        <div className="flex flex-col items-center justify-center gap-4 pt-24">
          <div className="w-8 h-8 rounded-full border-2 border-text-muted border-t-signal animate-spin" aria-hidden="true" />
          <p className="font-mono text-sm text-text-secondary">Loading replay…</p>
        </div>
      </div>
    );
  }

  if (watchPhase === "error") {
    return (
      <div className="min-h-screen bg-void text-text-primary">
        <Navbar contextLabel="1v1" />
        <div className="flex flex-col items-center justify-center gap-4 px-4 text-center pt-24">
          <p className="text-ember text-base">{errorMsg}</p>
          <Link
            href="/duel"
            className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            Back to duels
          </Link>
        </div>
      </div>
    );
  }

  if (!replayData) return null;

  const p1Name = replayData.player1?.displayName ?? "Player 1";
  const p2Name = replayData.player2?.displayName ?? "Player 2";
  const p1Id = replayData.player1?.id ?? "player1";
  const p2Id = replayData.player2?.id ?? "player2";
  const playerNames: Record<string, string> = { [p1Id]: p1Name, [p2Id]: p2Name };

  return (
    <div
      ref={sceneRef}
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col items-center overflow-hidden bg-void text-text-primary"
          : "flex flex-col items-center min-h-screen bg-void text-text-primary"
      }
    >
      {!isFullscreen && <Navbar contextLabel="1v1" />}
      {/* Header bar */}
      <div className="w-full max-w-md flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
        <div className="font-mono text-xs tabular-nums">
          <span className="text-signal">{p1Name}</span>
          <span className="text-text-muted mx-1">vs</span>
          <span className="text-[#6bb8ff]">{p2Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            replay
          </span>
          {watchPhase === "playing" && (
            <span className="flex items-center gap-1 font-mono text-xs text-ember">
              <span className="w-1.5 h-1.5 rounded-full bg-ember motion-safe:animate-pulse" aria-hidden="true" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Altitude readouts */}
      {state && (state.phase === "climb" || state.phase === "countdown") && (
        <div className="w-full max-w-md flex justify-between px-4 py-2 bg-surface-raised border-b border-border-subtle font-mono text-xs tabular-nums">
          <span className="text-signal">
            {p1Name}: {formatAltitude(state.players[0]?.y ?? 0, 1)}
          </span>
          <span className="text-[#6bb8ff]">
            {p2Name}: {formatAltitude(state.players[1]?.y ?? 0, 1)}
          </span>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1 flex items-start justify-center pt-4 w-full">
        <div
          ref={canvasBoxRef}
          data-climb-surface
          className="relative"
          style={{ width: canvasSize.width }}
        >
          {state && (
            <ClimbCanvas
              state={state}
              width={canvasSize.width}
              height={canvasSize.height}
              playerNames={playerNames}
            />
          )}

          {fullscreenSupported && (
            <FullscreenButton
              isFullscreen={isFullscreen}
              onToggle={toggleFullscreen}
              className="absolute right-2 top-2 z-30"
            />
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="w-full max-w-md px-4 py-6 flex flex-col gap-3 border-t border-border-subtle">
        {/* Winner badge */}
        {(watchPhase === "done") && (
          <div className="text-center mb-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted">
              {replayData.forfeit ? "Won by forfeit" : "Winner"}
            </p>
            <p className="font-display text-2xl font-black text-signal mt-1">
              {replayData.winnerId === p1Id
                ? p1Name
                : replayData.winnerId === p2Id
                ? p2Name
                : "Draw"}
            </p>
            {/* Peaks */}
            <div className="flex justify-center gap-6 mt-2 font-mono text-xs text-text-muted tabular-nums">
              {replayData.player1?.peak != null && (
                <span>
                  <span className="text-signal">{p1Name}</span>{" "}
                  {formatAltitude(replayData.player1.peak, 1)}
                </span>
              )}
              {replayData.player2?.peak != null && (
                <span>
                  <span className="text-[#6bb8ff]">{p2Name}</span>{" "}
                  {formatAltitude(replayData.player2.peak, 1)}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleWatchAgain}
            className="flex-1 inline-flex items-center justify-center rounded-full px-4 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
          >
            Watch again
          </button>
          <button
            onClick={handleCopyLink}
            className="flex-1 inline-flex items-center justify-center rounded-full px-4 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            {linkCopied ? "Link copied!" : "Share replay"}
          </button>
        </div>

        <Link
          href="/duel"
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          Back to duels
        </Link>
      </div>
    </div>
  );
}
