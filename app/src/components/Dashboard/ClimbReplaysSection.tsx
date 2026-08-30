"use client";

/**
 * ClimbReplaysSection — dashboard list of saved climb replays.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { Toast } from "../Toast";
import { buildReplayUrl } from "../../game/runReplay";

export interface ClimbReplayItem {
  id: string;
  peakY: number;
  createdAt: string;
  replayToken: string | null;
}

export function ClimbReplaysSection({ replays }: { replays: ClimbReplayItem[] }) {
  const [toast, setToast] = useState<string | null>(null);

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

  if (replays.length === 0) {
    return (
      <section
        aria-label="Climb replays"
        className="mb-8 rounded-2xl border border-border-subtle bg-surface p-6 text-center"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
          Climb replays
        </p>
        <p className="text-text-secondary text-sm mt-2 max-w-sm mx-auto">
          Signed-in runs with a shareable replay appear here. Play a climb while
          logged in to build your library.
        </p>
        <Link
          href="/play"
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-border-strong px-5 min-h-[44px] text-sm font-semibold text-text-primary hover:border-signal/50 transition"
        >
          Play free climb
        </Link>
      </section>
    );
  }

  const replayable = replays.filter((r) => r.replayToken);

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
        {replays.map((run) => (
          <li
            key={run.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="font-mono text-lg font-bold text-text-primary tabular-nums">
                {run.peakY.toFixed(0)}
                <span className="text-sm font-normal text-text-muted ml-1">m</span>
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
