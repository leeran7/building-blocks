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
import { StatusPage } from "../ui/StatusPage";
import { DUEL_HREF } from "../navLinks";
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
  | { phase: "error"; title: string; message: string };

export function DuelRoomLoader({ duelId }: { duelId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/duel/${duelId}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ phase: "error", title: "Duel not found", message: "This duel link is old or mistyped. Start a new one from the 1v1 page." });
          return;
        }
        if (!res.ok) {
          setState({ phase: "error", title: "Couldn't load this duel", message: "Something went wrong on our side. Reload the page to try again." });
          return;
        }
        const meta = (await res.json()) as { status: string };
        if (meta.status === "voided") {
          setState({ phase: "error", title: "Challenge cancelled", message: "This challenge was cancelled. Start a new one from the 1v1 page." });
          return;
        }
        setState({ phase: "room" });
      } catch {
        if (!cancelled) setState({ phase: "error", title: "Couldn't load this duel", message: "Check your connection, then reload the page." });
      }
    })();
    return () => { cancelled = true; };
  }, [duelId]);

  if (state.phase === "loading") {
    return (
      <main id="main-content" className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-text-muted font-mono text-sm">Loading duel…</span>
      </main>
    );
  }

  if (state.phase === "error") {
    return (
      <StatusPage contextLabel="1v1" eyebrow="1v1" title={state.title} primary={{ label: "Go to 1v1", href: DUEL_HREF }}>
        <p>{state.message}</p>
      </StatusPage>
    );
  }

  // The room's own states (lobby, run, result) render inside the page landmark.
  return (
    <main id="main-content">
      <DuelRoomInner duelId={duelId} />
    </main>
  );
}
