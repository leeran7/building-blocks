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
import { Spinner } from "../ui/Spinner";
import { StatusPage } from "../ui/StatusPage";
import { DUEL_HREF } from "../navLinks";
import { ClimbCanvas } from "../Game/ClimbCanvas";
import { FullscreenButton } from "../Game/FullscreenButton";
import { useCanvasSize } from "../../hooks/useCanvasSize";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFullscreen } from "../../hooks/useFullscreen";
import { createMatch, stepMatch, DEFAULT_SIM_CONFIG } from "../../game/simulation";
import { buildTower } from "../../game/towers";
import { buildDuelWatchUrl } from "../../game/runReplay";
import { formatAltitude } from "../../lib/units";
import { avatarIdsByPlayer } from "../../lib/avatars";
import type { MatchState, PlayerInput } from "../../game/types";
import {
  emptySample,
  sampleInterp,
  type RenderFrame,
} from "../../game/renderFeed";

// ─────────────────────────────── Types ────────────────────────────────────

interface PlayerInfo {
  id: string;
  displayName: string | null;
  /** Unchecked JSON, parsed at use (avatarIdsByPlayer). */
  avatarId?: unknown;
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

interface WatchError {
  title: string;
  message: string;
}

/** What the replay page says for each way loading it can fail. */
const REPLAY_ERRORS = {
  gone: { title: "Replay not found", message: "This duel is gone, or the link is mistyped." },
  unfinished: { title: "This duel hasn't finished yet", message: "The replay is ready once both climbers have finished." },
  failed: { title: "Couldn't load this replay", message: "Check your connection and try again." },
} satisfies Record<string, WatchError>;

const TICK_DT_MS = (1 / 30) * 1000;

/**
 * React state is a ~10 Hz snapshot for the altitude HUD; the canvas tracks the
 * sim through the render feed, so re-rendering this page every tick bought
 * nothing but layout work.
 */
const REACT_UPDATE_INTERVAL = 3;

// ─────────────────────────────── Component ────────────────────────────────

export function DuelWatch({ duelId }: { duelId: string }) {
  const [watchPhase, setWatchPhase] = useState<WatchPhase>("loading");
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [error, setError] = useState<WatchError>(REPLAY_ERRORS.failed);
  const [linkCopied, setLinkCopied] = useState(false);
  const [paused, setPaused] = useState(false);

  const stateRef = useRef<MatchState | null>(null);
  // Render handle for the canvas: latest tick plus the one before it, so the
  // painter can interpolate to the display's refresh rate.
  const renderRef = useRef<RenderFrame | null>(null);
  const prevSampleRef = useRef(emptySample());
  const rafRef = useRef(0);
  const accRef = useRef(0);
  const lastTsRef = useRef(0);
  const tickRef = useRef(0);
  const playingRef = useRef(false);
  // Set only by Pause, so togglePause can tell a paused replay from a done one.
  const pausedRef = useRef(false);

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
  // Only full screen locks the page: a watcher needs to scroll to the replay's
  // own controls (Pause, Share) below the canvas on a phone.
  useBodyScrollLock(isFullscreen);

  // Fetch replay data on mount
  useEffect(() => {
    fetch(`/api/duel/${duelId}/replay`)
      .then(async (r) => {
        if (!r.ok) {
          throw r.status === 404 ? REPLAY_ERRORS.gone : r.status === 409 ? REPLAY_ERRORS.unfinished : REPLAY_ERRORS.failed;
        }
        return r.json() as Promise<ReplayData>;
      })
      .then((data) => {
        setReplayData(data);
        setWatchPhase("ready");
      })
      .catch((err) => {
        setError(Object.values(REPLAY_ERRORS).includes(err) ? (err as WatchError) : REPLAY_ERRORS.failed);
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
      renderRef.current = { state: initial, prev: null, stepTs: 0 };
      setState(initial);
      accRef.current = 0;
      lastTsRef.current = 0;
      tickRef.current = 0;
      playingRef.current = true;
      pausedRef.current = false;
      setPaused(false);
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
          // Snapshot the outgoing tick's positions for the renderer to
          // interpolate from. Overwritten each step, so after the loop it holds
          // the tick immediately before `cur`.
          sampleInterp(cur, prevSampleRef.current);

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
            renderRef.current = { state: cur, prev: null, stepTs: 0 };
            setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
            setWatchPhase("done");
            cancelAnimationFrame(rafRef.current);
            return;
          }

          // Stop when we've exhausted both logs
          const climbTick = tickRef.current;
          if (cur.phase === "climb" && climbTick > log1.length && climbTick > log2.length) {
            playingRef.current = false;
            stateRef.current = cur;
            renderRef.current = { state: cur, prev: null, stepTs: 0 };
            setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
            setWatchPhase("done");
            cancelAnimationFrame(rafRef.current);
            return;
          }
        }

        if (advanced) {
          stateRef.current = cur;
          const frame = renderRef.current;
          if (frame) {
            frame.state = cur;
            frame.prev = prevSampleRef.current;
            frame.stepTs = ts - accRef.current;
          }
          if (cur.tick % REACT_UPDATE_INTERVAL === 0) {
            setState({ ...cur, players: cur.players.map((p) => ({ ...p })) });
          }
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

  // The loop keeps requesting frames while paused and skips them, so resuming
  // only has to restart the clock (else the pause would count as one huge dt).
  const togglePause = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      pausedRef.current = true;
      setPaused(true);
    } else if (pausedRef.current) {
      lastTsRef.current = 0;
      pausedRef.current = false;
      playingRef.current = true;
      setPaused(false);
    }
  }, []);

  // Space pauses too, so it works in full screen where the button is hidden.
  // A focused control handles its own Space press.
  useEffect(() => {
    if (watchPhase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target;
      if (t instanceof Element && t.closest("button, a, input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watchPhase, togglePause]);

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
        <main id="main-content" className="flex flex-col items-center justify-center gap-4 pt-24">
          <Spinner size="lg" />
          <p className="font-mono text-sm text-text-secondary">Loading replay…</p>
        </main>
      </div>
    );
  }

  if (watchPhase === "error") {
    return (
      <StatusPage contextLabel="1v1" eyebrow="Replay" title={error.title} primary={{ label: "Go to 1v1", href: DUEL_HREF }}>
        <p>{error.message}</p>
      </StatusPage>
    );
  }

  if (!replayData) return null;

  const p1Name = replayData.player1?.displayName ?? "Player 1";
  const p2Name = replayData.player2?.displayName ?? "Player 2";
  const p1Id = replayData.player1?.id ?? "player1";
  const p2Id = replayData.player2?.id ?? "player2";
  const playerNames: Record<string, string> = { [p1Id]: p1Name, [p2Id]: p2Name };
  const avatarIds = avatarIdsByPlayer([replayData.player1, replayData.player2]);

  const p1Peak = replayData.player1?.peak ?? null;
  const p2Peak = replayData.player2?.peak ?? null;
  const winner = replayData.winnerId === p1Id ? 1 : replayData.winnerId === p2Id ? 2 : 0;
  // Share of the two peaks, for the bar under the names.
  const p1Share = p1Peak != null && p2Peak != null && p1Peak + p2Peak > 0 ? p1Peak / (p1Peak + p2Peak) : null;
  const elapsed = formatClock(((state?.tick ?? 0) * TICK_DT_MS) / 1000);
  const status = watchPhase === "done" ? "Finished" : paused ? "Paused" : "Replay";

  return (
    <div
      ref={sceneRef}
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col items-center overflow-hidden bg-void text-text-primary"
          : "flex min-h-screen flex-col bg-void text-text-primary"
      }
    >
      {!isFullscreen && <Navbar contextLabel="1v1" />}
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Result first: who won and by how much, before the tower. */}
        {!isFullscreen && (
          <header className="px-4 pb-3 pt-4">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-text-muted">
              1v1 replay{replayData.forfeit ? " · won by forfeit" : ""}
            </p>
            <h1 className="mt-2 flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-2xl font-extrabold text-signal">
                  {p1Name}
                  {winner === 1 && <WinTag />}
                </span>
                {p1Peak != null && (
                  <span className="block font-mono text-sm font-normal tabular-nums text-text-secondary">{formatAltitude(p1Peak, 0)}</span>
                )}
              </span>
              <span className="self-center font-mono text-xs font-normal text-text-muted"> vs </span>
              <span className="min-w-0 flex-1 text-right">
                <span className="block truncate font-display text-2xl font-extrabold text-[#6bb8ff]">
                  {winner === 2 && <WinTag />}
                  {p2Name}
                </span>
                {p2Peak != null && (
                  <span className="block font-mono text-sm font-normal tabular-nums text-text-secondary">{formatAltitude(p2Peak, 0)}</span>
                )}
              </span>
            </h1>
            {p1Share != null && (
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                <span className="bg-signal" style={{ width: `${p1Share * 100}%` }} />
                <span className="flex-1 bg-[#6bb8ff]" />
              </div>
            )}
          </header>
        )}

        {/* The tower, framed */}
        <div className="flex flex-1 items-start justify-center px-4">
          <div
            ref={canvasBoxRef}
            data-climb-surface
            className={isFullscreen ? "relative" : "relative overflow-hidden rounded-2xl border border-border-subtle"}
            style={{ width: canvasSize.width }}
          >
            {state && (
              <ClimbCanvas
                state={state}
                feed={renderRef}
                width={canvasSize.width}
                height={canvasSize.height}
                playerNames={playerNames}
                avatarIds={avatarIds}
              />
            )}

            <p
              className={`absolute bottom-2 left-2 z-30 flex items-center gap-1.5 rounded-lg bg-void/75 px-2 py-1 font-mono text-xs uppercase tabular-nums ${
                status === "Replay" ? "text-ember" : "text-text-secondary"
              }`}
            >
              {status === "Replay" && <span className="h-1.5 w-1.5 rounded-full bg-ember motion-safe:animate-pulse" aria-hidden="true" />}
              {status}
              {status !== "Finished" && ` ${elapsed}`}
            </p>

            {fullscreenSupported && (
              <FullscreenButton
                isFullscreen={isFullscreen}
                onToggle={toggleFullscreen}
                // Bottom corner: the top one holds the lava readout.
                className="absolute bottom-2 right-2 z-30"
              />
            )}
          </div>
        </div>

        {/* Controls */}
        {!isFullscreen && (
          <div className="flex flex-col gap-2 px-4 pb-6 pt-3">
            <div className="flex gap-2">
              <button
                onClick={watchPhase === "playing" ? togglePause : handleWatchAgain}
                className="flex-1 inline-flex items-center justify-center rounded-full px-4 min-h-[48px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-[filter,transform,scale]"
              >
                {watchPhase === "playing" ? (paused ? "Resume" : "Pause") : "Watch again"}
              </button>
              <button
                onClick={handleCopyLink}
                className="flex-1 inline-flex items-center justify-center rounded-full px-4 min-h-[48px] border border-border-strong text-text-primary text-sm hover:border-signal/50 transition-colors"
              >
                {linkCopied ? "Link copied!" : "Share replay"}
              </button>
            </div>
            <Link
              href="/duel"
              className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
            >
              Back to 1v1
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function WinTag() {
  return (
    <span className="mx-1.5 align-middle font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-signal">win</span>
  );
}

/** Seconds as m:ss. */
function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

