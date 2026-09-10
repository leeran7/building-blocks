"use client";

/**
 * Entry point for /duel/[id].
 *
 * DuelRoom is dynamically imported with ssr: false — it pulls in Ably (a
 * browser-only client whose bundle the server SWC pass cannot parse).
 *
 * For chip duels (is_chip_duel), both players' chips are already escrowed at
 * room-creation / join time, so no funding gate is needed — the room loads
 * immediately, same as a free duel.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

const DuelRoomInner = dynamic(() => import("./DuelRoom").then((m) => m.DuelRoom), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <span className="text-text-muted font-mono text-sm">Loading duel…</span>
    </div>
  ),
});

type LoadState =
  | { phase: "loading" }
  | { phase: "room" }
  | { phase: "error"; message: string };

export function DuelRoomLoader({ duelId }: { duelId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/duel/${duelId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: "error", message: "Could not load this duel." });
          return;
        }
        const meta = (await res.json()) as { status: string };
        if (meta.status === "voided") {
          setState({ phase: "error", message: "This challenge was cancelled." });
          return;
        }
        setState({ phase: "room" });
      } catch {
        if (!cancelled) setState({ phase: "error", message: "Network error loading the duel." });
      }
    })();
    return () => { cancelled = true; };
  }, [duelId]);

  if (state.phase === "loading") {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-text-muted font-mono text-sm">Loading duel…</span>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-text-secondary text-sm">{state.message}</p>
        <Link
          href="/duel"
          className="inline-flex items-center justify-center rounded-full px-5 min-h-[44px] border border-border-strong text-text-secondary text-sm hover:border-signal/50 transition-colors"
        >
          Back to duels
        </Link>
      </div>
    );
  }

  return <DuelRoomInner duelId={duelId} />;
}
