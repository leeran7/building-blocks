"use client";

/**
 * DuelReplaysSection — dashboard list of recent completed duels.
 * Mirrors ClimbReplaysSection layout; shows W/L, peaks, and watch/share actions.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { Toast } from "../Toast";
import { buildDuelWatchUrl } from "../../game/runReplay";
import { formatAltitude } from "../../lib/units";

export interface DuelReplayItem {
  id: string;
  categorySlug: string;
  winnerId: string | null;
  forfeit: boolean;
  player1Peak: number | null;
  player2Peak: number | null;
  tiebreakRule: string | null;
  completedAt: string | null;
  hasReplay: boolean;
  opponent: { id: string; displayName: string | null } | null;
  mySlot: 1 | 2;
}

const COLLAPSED_COUNT = 5;

export function DuelReplaysSection({
  duels,
  userId,
}: {
  duels: DuelReplayItem[];
  userId: string;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const copyWatchLink = useCallback(async (id: string) => {
    const url = buildDuelWatchUrl(id, window.location.origin);
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setToast("Replay link copied");
    } catch {
      setToast("Couldn't copy link");
    }
  }, []);

  if (duels.length === 0) return null;

  const collapsible = duels.length > COLLAPSED_COUNT;
  const visible = collapsible && !expanded ? duels.slice(0, COLLAPSED_COUNT) : duels;

  return (
    <section aria-label="Recent duels" className="mb-8">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            1v1 duels
          </p>
          <h2 className="text-lg font-semibold text-text-primary mt-1">
            Recent duels
          </h2>
        </div>
        <Link
          href="/duel"
          className="text-sm text-signal hover:underline underline-offset-4 shrink-0"
        >
          Play 1v1
        </Link>
      </div>

      <ul className="rounded-2xl border border-border-subtle bg-surface divide-y divide-border-subtle overflow-hidden">
        {visible.map((duel) => {
          const iWon = duel.winnerId === userId;
          const isDraw = duel.winnerId === null;
          const myPeak = duel.mySlot === 1 ? duel.player1Peak : duel.player2Peak;
          const opponentPeak = duel.mySlot === 1 ? duel.player2Peak : duel.player1Peak;
          const opponentName = duel.opponent?.displayName ?? "Opponent";

          return (
            <li
              key={duel.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-sm font-bold ${
                      iWon ? "text-signal" : isDraw ? "text-text-secondary" : "text-ember"
                    }`}
                  >
                    {duel.forfeit && iWon
                      ? "W (forfeit)"
                      : duel.forfeit && !iWon
                      ? "L (forfeit)"
                      : iWon
                      ? "W"
                      : isDraw
                      ? "Draw"
                      : "L"}
                  </span>
                  <span className="text-text-muted text-xs">vs {opponentName}</span>
                </div>
                <div className="font-mono tabular-nums text-xs text-text-muted mt-0.5 flex items-center gap-2">
                  {myPeak != null && (
                    <span className="text-text-secondary">
                      {formatAltitude(myPeak, 1)} you
                    </span>
                  )}
                  {opponentPeak != null && (
                    <span>{formatAltitude(opponentPeak, 1)} opp</span>
                  )}
                  {duel.completedAt && (
                    <span className="hidden sm:inline">
                      · {formatDuelDate(duel.completedAt)}
                    </span>
                  )}
                </div>
              </div>

              {duel.hasReplay ? (
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/duel/${duel.id}/watch`}
                    className="text-sm font-medium bg-signal/10 text-signal border border-signal/30 hover:bg-signal/20 px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
                  >
                    Watch
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyWatchLink(duel.id)}
                    className="text-sm font-medium border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
                  >
                    Copy link
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 w-full rounded-lg border border-border-subtle bg-surface px-4 min-h-[40px] text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition inline-flex items-center justify-center gap-1.5"
        >
          {expanded ? "Show less" : `Show all ${duels.length} duels`}
          <span aria-hidden="true" className="text-text-muted">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
      ) : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </section>
  );
}

function formatDuelDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
