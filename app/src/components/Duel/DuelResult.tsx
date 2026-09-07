"use client";

/**
 * Result screen after a duel completes.
 *
 * Shows win/loss, both players' peak heights, tiebreak rule, and
 * action buttons: Rematch, Share, and Play again.
 *
 * When a `realtime` handle is supplied the component:
 * - Listens for a server-published "rematch" Ably message and auto-navigates
 *   the waiting player to the new duel room (AC-8).
 * - Subscribes to presence-leave events so it can surface "Opponent has left"
 *   and disable the Rematch button when the other player closes their tab (AC-9).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { formatAltitude } from "../../lib/units";
import type { RealtimeHandle } from "../../net/realtime";

// ─────────────────────────────── Types ────────────────────────────────────

export interface DuelResultProps {
  winnerId: string | null;
  myId: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  player1Peak: number | null;
  player2Peak: number | null;
  tiebreakRule: string | null;
  forfeit: boolean;
  duelId: string;
  onRematch?: (newDuelId: string) => void;
  /** The live Ably handle kept open from the match. Enables AC-8 and AC-9. */
  realtime?: RealtimeHandle;
}

function tiebreakLabel(rule: string): string {
  switch (rule) {
    case "peak_y":
      return "Won by higher peak";
    case "earlier_peak":
      return "Won by earlier peak";
    case "slot":
      return "Won by starting position";
    default:
      return rule;
  }
}

// ─────────────────────────────── Component ────────────────────────────────

export function DuelResult({
  winnerId,
  myId,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  player1Peak,
  player2Peak,
  tiebreakRule,
  forfeit,
  duelId,
  onRematch,
  realtime,
}: DuelResultProps) {
  const { user, token } = useAuth();
  const router = useRouter();

  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string>("");
  const [shared, setShared] = useState(false);
  /** AC-9: true when the opponent leaves presence on the result screen. */
  const [opponentLeft, setOpponentLeft] = useState(false);

  const opponentId = player1Id === myId ? player2Id : player1Id;

  // AC-8: Listen for server-published "rematch" event so the waiting player
  // is automatically redirected when the other player presses Rematch.
  // AC-9: Listen for presence-leave events to detect when the opponent closes
  // their tab and disable the Rematch button accordingly.
  useEffect(() => {
    if (!realtime) return;

    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) {
        if (onRematch) {
          onRematch(msg.newDuelId);
        } else {
          router.push(`/duel/${msg.newDuelId}`);
        }
      }
    });

    const unsubPresence = realtime.onPresence((action, member) => {
      if (action === "leave" && member.clientId === opponentId) {
        setOpponentLeft(true);
      }
      // If they rejoin (e.g. reconnect), clear the flag.
      if ((action === "enter" || action === "present") && member.clientId === opponentId) {
        setOpponentLeft(false);
      }
    });

    return () => {
      unsubRematch();
      unsubPresence();
    };
  }, [realtime, opponentId, onRematch, router]);

  const iWon = winnerId === myId;
  const isDraw = winnerId === null;

  const handleRematch = useCallback(async () => {
    setRematchLoading(true);
    setRematchError("");
    try {
      const res = await fetch(`/api/duel/${duelId}/rematch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRematchError(body.error ?? "Could not start rematch.");
        setRematchLoading(false);
        return;
      }

      const body = (await res.json()) as { newDuelId: string };
      // AC-8: Server will publish the Ably "rematch" event to the opponent.
      // Navigate the pressing player immediately; the opponent will be
      // redirected by the useEffect listener above.
      setRematchLoading(false);
      if (onRematch) {
        onRematch(body.newDuelId);
      } else {
        router.push(`/duel/${body.newDuelId}`);
      }
    } catch {
      setRematchError("Network error. Please try again.");
      setRematchLoading(false);
    }
  }, [duelId, token, onRematch, router]);

  const handleShare = useCallback(async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/duel/${duelId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Fallback silent
    }
  }, [duelId]);

  // ─────────────── Result label ────────────────

  const resultLabel = forfeit
    ? "Opponent disconnected"
    : isDraw
    ? "Draw"
    : iWon
    ? "You won!"
    : "You lost";

  const resultColor = forfeit
    ? "text-signal"
    : isDraw
    ? "text-text-secondary"
    : iWon
    ? "text-signal"
    : "text-text-muted";

  // ─────────────── Render ───────────────

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center px-4 py-16 text-text-primary">
      {/* Result headline */}
      <div className="text-center mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted mb-2">
          match over
        </p>
        <h1
          className={`font-display text-6xl md:text-7xl font-black uppercase tracking-tight ${resultColor}`}
          aria-live="polite"
        >
          {resultLabel}
        </h1>
        {forfeit && (
          <p className="mt-2 text-text-secondary text-sm">
            You win by forfeit.
          </p>
        )}
        {tiebreakRule && !forfeit && (
          <p className="mt-2 font-mono text-xs text-text-muted uppercase tracking-[0.12em]">
            {tiebreakLabel(tiebreakRule)}
          </p>
        )}
      </div>

      {/* Player peaks */}
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border-subtle p-5 mb-6">
        <div className="flex flex-col gap-3">
          <PlayerRow
            name={player1Name}
            peak={player1Peak}
            isWinner={winnerId === player1Id}
            isLocal={player1Id === myId}
            color="signal"
          />
          <div className="h-px bg-border-subtle" />
          <PlayerRow
            name={player2Name}
            peak={player2Peak}
            isWinner={winnerId === player2Id}
            isLocal={player2Id === myId}
            color="blue"
          />
        </div>
      </div>

      {/* AC-9: opponent left notice */}
      {opponentLeft && (
        <div
          role="status"
          className="w-full max-w-sm mb-2 px-4 py-2 rounded-xl bg-surface border border-border-subtle text-center"
        >
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted">
            Opponent has left
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {/* Rematch */}
        <button
          onClick={handleRematch}
          disabled={rematchLoading || !user || opponentLeft}
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-[filter,transform]"
          aria-label={opponentLeft ? "Rematch unavailable — opponent has left" : "Rematch"}
        >
          {rematchLoading ? (
            <span
              className="w-4 h-4 rounded-full border-2 border-void/40 border-t-void animate-spin"
              aria-hidden="true"
            />
          ) : (
            "Rematch"
          )}
        </button>

        {rematchError && (
          <p className="text-ember text-xs text-center">{rematchError}</p>
        )}

        {/* Share */}
        <button
          onClick={handleShare}
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
        >
          {shared ? "Link copied!" : "Share"}
        </button>

        {/* Play again */}
        <Link
          href="/duel"
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          Play again
        </Link>
      </div>

      {/* Sign in CTA for anon users */}
      {!user && (
        <p className="mt-8 text-text-muted text-sm text-center">
          <a href="/auth/signin" className="text-signal underline underline-offset-2">
            Sign in
          </a>{" "}
          to save your record.
        </p>
      )}
    </div>
  );
}

// ─────────────── Sub-component ────────────────

interface PlayerRowProps {
  name: string;
  peak: number | null;
  isWinner: boolean;
  isLocal: boolean;
  color: "signal" | "blue";
}

function PlayerRow({ name, peak, isWinner, isLocal, color }: PlayerRowProps) {
  const nameColor = color === "signal" ? "text-signal" : "text-[#6bb8ff]";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        {isWinner && (
          <span className="font-mono text-xs text-signal" aria-label="winner">
            ★
          </span>
        )}
        <span className={`font-mono text-sm font-semibold ${nameColor} truncate`}>
          {name}
          {isLocal && (
            <span className="font-mono text-xs text-text-muted ml-1">(you)</span>
          )}
        </span>
      </div>
      <span className="font-mono tabular-nums text-sm text-text-primary">
        {peak !== null ? formatAltitude(peak, 1) : "—"}
      </span>
    </div>
  );
}
