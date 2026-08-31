"use client";

/**
 * ClimbReplaysSection — dashboard list of saved climb replays.
 * Copy/share uses `/r/{id}` when a replay token exists; no share when null.
 */

import { useState } from "react";
import Link from "next/link";
import { Toast } from "../Toast";
import { resolveBaseUrl } from "../../config/public";
import { buildDashboardShareActions } from "../../share/dashboard";
import { SHARE_CONTROL_LAYOUT } from "../../share/controlLayout";
import { ShareControls } from "../Game/ShareControls";

export interface ClimbReplayItem {
  id: string;
  peakY: number;
  createdAt: string;
  replayToken: string | null;
}

export function ClimbReplaysSection({ replays }: { replays: ClimbReplayItem[] }) {
  const [toast, setToast] = useState<string | null>(null);
  const origin = resolveBaseUrl();

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
        {replays.map((run) => {
          const actions = buildDashboardShareActions(
            {
              id: run.id,
              peakY: run.peakY,
              replayToken: run.replayToken,
            },
            origin
          );
          return (
            <li
              key={run.id}
              className="flex flex-col gap-3 px-4 py-3.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  <Link
                    href={`/r/${run.id}`}
                    className={`${SHARE_CONTROL_LAYOUT.className} text-sm font-medium bg-signal/10 text-signal border border-signal/30 hover:bg-signal/20 px-3.5 rounded-lg transition`}
                  >
                    Watch
                  </Link>
                ) : null}
              </div>
              {actions.length > 0 ? (
                <ShareControls actions={actions} onToast={setToast} />
              ) : null}
            </li>
          );
        })}
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
