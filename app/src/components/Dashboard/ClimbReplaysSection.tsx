"use client";

/**
 * ClimbReplaysSection — dashboard list of saved climb replays.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { Toast } from "../Toast";
import { buildReplayUrl } from "../../game/runReplay";
import { ALTITUDE_UNIT } from "../../lib/units";

export interface ClimbReplayItem {
  id: string;
  peakY: number;
  createdAt: string;
  replayToken: string | null;
}

/** Runs shown before the list collapses behind a "Show all" toggle. */
const COLLAPSED_COUNT = 5;

export function ClimbReplaysSection({ replays }: { replays: ClimbReplayItem[] }) {
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const copyReplay = useCallback(async (token: string) => {
    const url = buildReplayUrl(token, window.location.origin);
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setToast("Replay link copied");
    } catch {
      setToast("Couldn't copy link");
    }
  }, []);

  // Hide the whole section until the user has at least one saved run.
  if (replays.length === 0) return null;

  const replayable = replays.filter((r) => r.replayToken);
  const collapsible = replays.length > COLLAPSED_COUNT;
  const visibleReplays =
    collapsible && !expanded ? replays.slice(0, COLLAPSED_COUNT) : replays;

  return (
    <section aria-label="Climb replays" className="mb-8">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Climb replays
          </p>
          <h2 className="text-lg font-semibold text-text-primary mt-1">
            Your runs
          </h2>
        </div>
        <Link
          href="/play"
          className="text-sm text-signal hover:underline underline-offset-4 shrink-0"
        >
          Play again
        </Link>
      </div>

      <ul className="rounded-2xl border border-border-subtle bg-surface divide-y divide-border-subtle overflow-hidden">
        {visibleReplays.map((run) => (
          <li
            key={run.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold text-text-primary tabular-nums">
                {run.peakY.toFixed(0)}
                <span className="text-sm font-normal text-text-muted ml-1">{ALTITUDE_UNIT}</span>
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatReplayDate(run.createdAt)}
                {!run.replayToken ? " · replay unavailable" : null}
              </p>
            </div>
            {run.replayToken ? (
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/play?r=${encodeURIComponent(run.replayToken)}`}
                  className="text-sm font-medium bg-signal/10 text-signal border border-signal/30 hover:bg-signal/20 px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
                >
                  Watch
                </Link>
                <button
                  type="button"
                  onClick={() => copyReplay(run.replayToken!)}
                  className="text-sm font-medium border border-border-strong text-text-secondary hover:bg-elevated hover:text-text-primary px-3.5 py-2 rounded-lg transition min-h-[40px] inline-flex items-center"
                >
                  Copy link
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 w-full rounded-lg border border-border-subtle bg-surface px-4 min-h-[40px] text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition inline-flex items-center justify-center gap-1.5"
        >
          {expanded ? "Show less" : `Show all ${replays.length} runs`}
          <span aria-hidden="true" className="text-text-muted">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
      ) : null}

      {replayable.length === 0 && replays.length > 0 ? (
        <p className="text-xs text-text-muted mt-3 text-center">
          Older runs were saved before replay recording. New climbs will appear
          with watch and share links.
        </p>
      ) : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </section>
  );
}

function formatReplayDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
