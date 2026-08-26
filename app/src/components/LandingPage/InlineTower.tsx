"use client";

/**
 * InlineTower — a tower's live leaderboard expanded in place on the landing.
 *
 * Fetches the stack's data only when opened (no N-fetch on load) and mounts the
 * real virtualized TowerView bounded to a fixed height so it scrolls internally
 * and only THIS (open) tower polls for live updates. Includes a link to the
 * full dedicated tower page for sharing/SEO.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { TowerData } from "../Tower/TowerView";

const TowerView = dynamic(
  () => import("../Tower/TowerView").then((m) => ({ default: m.TowerView })),
  { ssr: false }
);

export function InlineTower({ slug, label, onClose }: { slug: string; label: string; onClose: () => void }) {
  const [data, setData] = useState<TowerData | null>(null);
  const [error, setError] = useState(false);
  const pollUrl = `/api/stack/${slug}`;

  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    fetch(pollUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((d: TowerData) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [pollUrl]);

  return (
    <div className="col-span-full rounded-2xl border border-signal/40 bg-surface overflow-hidden shadow-lifted animate-enter">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border-subtle">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
          [ {label} stack · live ]
        </span>
        <div className="flex items-center gap-3">
          <Link
            href={`/stack/${slug}`}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-signal transition-colors"
          >
            Open full ↗
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted hover:text-signal transition-colors min-h-[36px]"
            aria-label={`Collapse ${label} stack`}
          >
            Close ✕
          </button>
        </div>
      </div>

      <div className="h-[520px]">
        {error ? (
          <div className="h-full grid place-items-center px-4 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted">
              couldn’t load this stack ·{" "}
              <Link href={`/stack/${slug}`} className="text-signal">
                open full ↗
              </Link>
            </p>
          </div>
        ) : data ? (
          <TowerView initialData={data} pollUrl={pollUrl} />
        ) : (
          <div className="h-full grid place-items-center">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-muted animate-pulse">
              loading standings…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
