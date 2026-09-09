"use client";

/**
 * Entry point for /duel/[id]. Two responsibilities:
 *
 * 1. Paid-duel funding gate: before touching realtime or revealing the tower,
 *    fetch duel meta. If the duel has a stake and both players have not yet
 *    staked, render PaidDuelJoinGate (polling for the opponent). Only once both
 *    stakes are held does the real room load. Free duels (stakeCents == null)
 *    skip the gate entirely and behave exactly as before.
 *
 * 2. DuelRoom is dynamically imported with ssr: false — it pulls in Ably (a
 *    browser-only client whose bundle the server SWC pass cannot parse).
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaidDuelJoinGate, PaidDuelMeta } from "./PaidDuelJoinGate";

const DuelRoomInner = dynamic(() => import("./DuelRoom").then((m) => m.DuelRoom), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <span className="text-text-muted font-mono text-sm">Loading duel…</span>
    </div>
  ),
});

interface DuelMetaResponse {
  id: string;
  status: string;
  stakeCents: number | null;
  player1: { id: string; displayName: string | null } | null;
  player2: { id: string; displayName: string | null } | null;
  player1Staked: boolean;
  player2Staked: boolean;
}

type GateState =
  | { phase: "loading" }
  | { phase: "gate"; meta: PaidDuelMeta }
  | { phase: "room" }
  | { phase: "error"; message: string };

export function DuelRoomLoader({ duelId }: { duelId: string }) {
  const [state, setState] = useState<GateState>({ phase: "loading" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const evaluate = useCallback(async () => {
    try {
      const res = await fetch(`/api/duel/${duelId}`, { cache: "no-store" });
      if (!res.ok) {
        setState({ phase: "error", message: "Could not load this duel." });
        return "stop";
      }
      const meta = (await res.json()) as DuelMetaResponse;
      const stakeCents = meta.stakeCents;

      // Free duel, or paid duel with both stakes held → enter the real room.
      if (stakeCents == null || (meta.player1Staked && meta.player2Staked)) {
        setState({ phase: "room" });
        return "stop";
      }
      // A cancelled/refunded paid challenge should not sit on the gate forever.
      if (meta.status === "voided") {
        setState({ phase: "error", message: "This challenge was cancelled." });
        return "stop";
      }
      setState({
        phase: "gate",
        meta: {
          id: meta.id,
          stakeCents,
          player1: meta.player1,
          player2: meta.player2,
          player1Staked: meta.player1Staked,
          player2Staked: meta.player2Staked,
        },
      });
      return "continue";
    } catch {
      setState({ phase: "error", message: "Network error loading the duel." });
      return "stop";
    }
  }, [duelId]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const outcome = await evaluate();
      if (cancelled) return;
      // Keep polling only while the gate is showing (waiting on the opponent).
      if (outcome === "continue" && !pollRef.current) {
        pollRef.current = setInterval(async () => {
          const o = await evaluate();
          if (o === "stop" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 3000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [evaluate]);

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

  if (state.phase === "gate") {
    return <PaidDuelJoinGate meta={state.meta} onStaked={() => setState({ phase: "room" })} />;
  }

  return <DuelRoomInner duelId={duelId} />;
}
