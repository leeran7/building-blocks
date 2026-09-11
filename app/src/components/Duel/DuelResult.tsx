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
 *
 * Rematch is also drop-safe: alongside the Ably event we poll the duel meta for
 * `rematchDuelId`, so a dropped realtime packet can never strand either player
 * in a lobby they can't leave.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "../../contexts/AuthContext";
import { formatAltitude } from "../../lib/units";
import { buildDuelWatchUrl } from "../../game/runReplay";
import { shareInvite } from "../../lib/shareInvite";
import { PAID_DUELS_ENABLED_PUBLIC } from "../../config/paidDuel";
import { formatChipCents } from "../../config/chipPackages";
import { authedFetch } from "../../lib/authedFetch";
import {
  SIGNIN_HREF,
  CHIP_DUELS_HREF,
  DASHBOARD_HREF,
  DUEL_HREF,
} from "../navLinks";
import type { RealtimeHandle } from "../../net/realtime";
import type { ResultSource } from "../../game/useRace";

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
  /** True when the server never recorded the result (all submits failed). */
  resultError?: boolean;
  /** Re-attempt the failed result submission. */
  onRetrySubmit?: () => void;
  /** Whether both replay logs were stored (enables the Watch replay button). */
  hasReplay?: boolean;
  /**
   * Where the shown result came from. While 'provisional' the winner is the
   * instant local sim's guess and may still reconcile to the server's truth, so
   * we show a quiet "confirming…" affordance and hold back the celebration beat.
   */
  resultSource?: ResultSource;
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
  resultError,
  onRetrySubmit,
  hasReplay = false,
  resultSource = "authoritative",
}: DuelResultProps) {
  const { user, token } = useAuth();
  const router = useRouter();

  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string>("");
  /**
   * True once the local player has requested a rematch and we're waiting for the
   * opponent to arrive (via the Ably "rematch" event or the meta poll). Keeps
   * the presser on this screen with a clear "waiting" state instead of dropping
   * them alone into a fresh lobby.
   */
  const [rematchPending, setRematchPending] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  /** AC-9: true when the opponent leaves presence on the result screen. */
  const [opponentLeft, setOpponentLeft] = useState(false);
  /** Paid-duel settlement, read once from meta (null for free duels). */
  const [paid, setPaid] = useState<{
    stakeCents: number;
    payoutCents: number | null;
    refunded: boolean;
    isChipDuel: boolean;
  } | null>(null);

  const opponentId = player1Id === myId ? player2Id : player1Id;

  /** Guard so both the event and the poll can't double-navigate. */
  const navigatedRef = useRef(false);
  const goToRematch = useCallback(
    (newDuelId: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      if (onRematch) onRematch(newDuelId);
      else router.push(`/duel/${newDuelId}`);
    },
    [onRematch, router]
  );

  // AC-8: Listen for server-published "rematch" event so the waiting player
  // is automatically redirected when the other player presses Rematch.
  // AC-9: Listen for presence-leave events to detect when the opponent closes
  // their tab and disable the Rematch button accordingly.
  useEffect(() => {
    if (!realtime) return;

    const unsubRematch = realtime.onEvent("rematch", (msg) => {
      if (msg.newDuelId) goToRematch(msg.newDuelId);
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
  }, [realtime, opponentId, goToRematch]);

  // Drop-safe rematch fallback: poll the duel meta for `rematchDuelId` so a
  // dropped Ably "rematch" packet can't strand either player. Covers both sides
  // — the presser (waiting for the opponent) and the opponent (waiting for the
  // pointer to land). Cheap (~every 2s) and torn down on unmount / navigation.
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (navigatedRef.current) return;
      try {
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const res = await fetch(`/api/duel/${duelId}`, { headers });
        if (!res.ok || cancelled) return;
        const meta = (await res.json()) as { rematchDuelId?: string | null };
        if (meta.rematchDuelId) goToRematch(meta.rematchDuelId);
      } catch {
        // Transient — the next tick retries.
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [duelId, token, goToRematch]);

  const iWon = winnerId === myId;
  const isDraw = winnerId === null;
  const provisional = resultSource === "provisional";

  // Paid duels: read stake/payout from meta once. payoutCents is set on the
  // duel by the server the moment it settles, so this reflects the authoritative
  // credit even though the on-screen result may still be provisional.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/duel/${duelId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const meta = (await res.json()) as {
          stakeCents: number | null;
          payoutCents: number | null;
          refunded: boolean;
          isChipDuel: boolean;
        };
        if (meta.stakeCents != null && !cancelled) {
          setPaid({
            stakeCents: meta.stakeCents,
            payoutCents: meta.payoutCents,
            refunded: meta.refunded,
            isChipDuel: meta.isChipDuel,
          });
        }
      } catch {
        // Non-critical — the wallet on the dashboard is the source of truth.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [duelId]);

  // Margin between the two peaks — the headline "how close was it" number.
  const myPeak = player1Id === myId ? player1Peak : player2Peak;
  const theirPeak = player1Id === myId ? player2Peak : player1Peak;
  const margin =
    myPeak !== null && theirPeak !== null ? Math.abs(myPeak - theirPeak) : null;

  const handleRematch = useCallback(async () => {
    if (!token) return;
    setRematchLoading(true);
    setRematchError("");
    try {
      const res = await authedFetch(`/api/duel/${duelId}/rematch`, token, {
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
      // AC-8: the server publishes the Ably "rematch" event to the opponent and
      // sets the meta pointer we poll. Rather than dropping the presser alone
      // into the fresh lobby, show a clear "waiting for opponent" state here and
      // navigate BOTH players together once the opponent is confirmed en route
      // (the event / poll fires goToRematch on both sides). If the opponent
      // never comes, the new lobby's own timeout is the backstop after we go.
      setRematchLoading(false);
      setRematchPending(true);
      // The presser still needs to reach the new room; give the opponent a brief
      // window to receive the pointer, then follow so we're never stuck here.
      setTimeout(() => goToRematch(body.newDuelId), 1500);
    } catch {
      setRematchError("Network error. Please try again.");
      setRematchLoading(false);
    }
  }, [duelId, token, goToRematch]);

  const handleShare = useCallback(async () => {
    // Share the watch link when a replay is available, otherwise the room URL.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = hasReplay
      ? buildDuelWatchUrl(duelId, origin)
      : `${origin}/duel/${duelId}`;
    setShareFailed(false);
    // Native share sheet first, clipboard/prompt as fallback (shareInvite).
    const outcome = await shareInvite(url, {
      title: "Doomstack — 1v1 duel",
      text: hasReplay ? "Watch how this duel went." : "Race me to the top.",
    });
    if (outcome === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } else if (outcome === "failed") {
      setShareFailed(true);
    }
  }, [duelId, hasReplay]);

  // ─────────────── Result label ────────────────

  const resultLabel = forfeit
    ? iWon
      ? "You won"
      : "You lost"
    : isDraw
    ? "Draw"
    : iWon
    ? "You won!"
    : "So close";

  // Win = celebratory signal; loss = graceful (warm, not alarming) rather than a
  // muted "you failed". Forfeit-loss and draw stay neutral.
  const resultColor = forfeit
    ? iWon
      ? "text-signal"
      : "text-text-secondary"
    : isDraw
    ? "text-text-secondary"
    : iWon
    ? "text-signal"
    : "text-text-primary";

  // Human "how it was decided" line under the headline.
  const decidedLine = forfeit
    ? iWon
      ? "Opponent disconnected — you win by forfeit."
      : "You left the match."
    : isDraw
    ? "A dead heat."
    : tiebreakRule
    ? tiebreakLabel(tiebreakRule)
    : null;

  // ─────────────── Render ───────────────

  return (
    <div className="relative min-h-screen bg-void flex flex-col items-center justify-center px-4 py-16 text-text-primary overflow-hidden">
      {/* Flat animated atmosphere: a soft signal (win) / neutral (loss) glow that
          breathes behind the result. transform/opacity only; disabled under
          reduced-motion so there is never motion-only meaning. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-[-20%] h-[60%] blur-3xl opacity-[0.18] motion-safe:animate-groundRise ${
          iWon && !forfeit && !provisional ? "bg-signal/40" : "bg-border-strong/30"
        }`}
      />

      {/* Result headline */}
      <div className="relative text-center mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted mb-2">
          match over
        </p>
        <h1
          className={`font-display text-6xl md:text-7xl font-black uppercase tracking-tight ${resultColor} ${
            iWon && !forfeit && !provisional
              ? "motion-safe:animate-rise [text-shadow:0_0_44px_rgb(203_242_77/0.45)]"
              : ""
          }`}
          aria-live="polite"
        >
          {resultLabel}
        </h1>

        {/* Margin — the emotional number. Winning: "by Xm". Losing: "peak Xm behind". */}
        {!forfeit && !isDraw && margin !== null && (
          <p className="mt-3 font-mono text-sm tabular-nums text-text-secondary">
            {iWon ? (
              <>
                Won by{" "}
                <span className="text-signal font-semibold">
                  {formatAltitude(margin, 1)}
                </span>
              </>
            ) : (
              <>
                Just{" "}
                <span className="text-text-primary font-semibold">
                  {formatAltitude(margin, 1)}
                </span>{" "}
                short
              </>
            )}
          </p>
        )}

        {decidedLine && (
          <p className="mt-2 font-mono text-xs text-text-muted uppercase tracking-[0.12em]">
            {decidedLine}
          </p>
        )}

        {/* Provisional → authoritative: a quiet, non-alarming "confirming…" cue
            while the server re-sim reconciles. Kept subtle so the eventual firm
            never reads as a glitch. */}
        {provisional && (
          <p
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted"
            role="status"
            aria-live="polite"
          >
            <span
              className="w-2 h-2 rounded-full border border-text-muted border-t-signal motion-safe:animate-spin"
              aria-hidden="true"
            />
            Confirming result…
          </p>
        )}
      </div>

      {/* Player peaks */}
      <div className="relative w-full max-w-sm bg-surface rounded-xl border border-border-subtle p-5 mb-6">
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

      {/* Paid-duel settlement banner */}
      {paid && (
        <div
          className={`w-full max-w-sm mb-4 px-4 py-3 rounded-xl border text-center ${
            iWon && paid.payoutCents
              ? "bg-signal/10 border-signal/40"
              : "bg-surface border-border-subtle"
          }`}
        >
          {paid.refunded ? (
            <p className="font-mono text-sm text-text-secondary">
              Stake refunded to your chips.
            </p>
          ) : iWon && paid.payoutCents ? (
            <>
              <p className="font-mono text-lg font-bold tabular-nums text-signal">
                + {formatChipCents(paid.payoutCents)} chips
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-text-muted mt-0.5">
                added to your chips ·{" "}
                <Link href={DASHBOARD_HREF} className="text-signal underline underline-offset-2">
                  wallet
                </Link>
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-text-secondary tabular-nums">
              Staked {formatChipCents(paid.stakeCents)} chips
            </p>
          )}
        </div>
      )}

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

      {/* Result-not-saved banner (all submit attempts failed) */}
      {resultError && (
        <div
          role="alert"
          className="w-full max-w-sm mb-2 px-4 py-3 rounded-xl bg-surface border border-ember/40 text-center"
        >
          <p className="text-ember text-sm mb-2">
            We couldn&apos;t save this result.
          </p>
          <button
            onClick={onRetrySubmit}
            className="inline-flex items-center justify-center rounded-full px-5 min-h-[40px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            Retry saving
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="relative flex flex-col gap-3 w-full max-w-sm">
        {/* Rematch — once requested, the presser waits here (drop-safe) instead
            of being dropped alone into a fresh lobby. */}
        {rematchPending ? (
          <div
            className="flex items-center justify-center gap-2 rounded-full px-6 min-h-[44px] bg-surface border border-signal/40 text-text-secondary text-sm"
            role="status"
            aria-live="polite"
          >
            <Spinner aria-hidden="true" />
            Rematch requested — waiting for opponent…
          </div>
        ) : (
          <div className={paid ? "flex gap-2" : ""}>
            <button
              onClick={handleRematch}
              disabled={rematchLoading || !user || opponentLeft}
              className={`inline-flex items-center justify-center rounded-full px-6 min-h-[44px] bg-signal text-void font-semibold text-sm hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-[filter,transform] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void ${paid ? "flex-1" : "w-full"}`}
              aria-label={opponentLeft ? "Rematch unavailable — opponent has left" : paid ? "Rematch (free)" : "Rematch"}
            >
              {rematchLoading ? (
                <span
                  className="w-4 h-4 rounded-full border-2 border-void/40 border-t-void motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : paid ? (
                "Rematch (free)"
              ) : (
                "Rematch"
              )}
            </button>
            {paid?.isChipDuel && (
              <Link
                href={CHIP_DUELS_HREF}
                className="flex-1 inline-flex items-center justify-center rounded-full px-4 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
              >
                Chip rematch →
              </Link>
            )}
          </div>
        )}

        {rematchError && (
          <p className="text-ember text-xs text-center">{rematchError}</p>
        )}

        {/* Guest can't rematch — point them to sign-in instead of a dead button */}
        {!user && !opponentLeft && (
          <p className="text-text-muted text-xs text-center">
            <a href={SIGNIN_HREF} className="text-signal underline underline-offset-2">
              Sign in
            </a>{" "}
            to rematch.
          </p>
        )}

        {/* Watch replay */}
        {hasReplay && (
          <Link
            href={`/duel/${duelId}/watch`}
            className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
          >
            Watch replay
          </Link>
        )}

        {/* Share */}
        <button
          onClick={handleShare}
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
        >
          {shared ? "Link copied!" : hasReplay ? "Share replay" : "Share"}
        </button>
        {shareFailed && (
          <p className="text-ember text-xs text-center">Couldn&apos;t copy the link.</p>
        )}

        {/* Post-free-duel: low-key nudge toward paid at the highest-intent moment.
            Only shown when the duel was free, the flag is on, and the user is signed in.
            Not a primary CTA — Rematch holds that role. */}
        {paid === null && PAID_DUELS_ENABLED_PUBLIC && user && (
          <Link
            href={DUEL_HREF}
            className="inline-flex items-center justify-center px-6 min-h-[40px] font-mono text-xs text-text-muted hover:text-signal transition-colors"
          >
            Want to play for the pot? →
          </Link>
        )}

        {/* Play again */}
        <Link
          href={DUEL_HREF}
          className="inline-flex items-center justify-center rounded-full px-6 min-h-[44px] font-mono text-xs uppercase tracking-[0.12em] text-text-muted hover:text-text-primary transition-colors"
        >
          Play again
        </Link>
      </div>

      {/* Sign in CTA for anon users */}
      {!user && (
        <p className="relative mt-8 text-text-muted text-sm text-center">
          <a href={SIGNIN_HREF} className="text-signal underline underline-offset-2">
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
