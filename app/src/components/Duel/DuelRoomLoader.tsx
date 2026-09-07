"use client";

/**
 * Client-component wrapper that dynamically imports DuelRoom with ssr: false.
 *
 * DuelRoom imports Ably (a browser-only WebSocket client). Ably's compiled
 * bundle uses an arrow-function-super pattern that Next.js's SWC transform
 * cannot parse when the next-flight-client-module-loader analyzes client
 * components on the server webpack pass. Loading it through this client-side
 * dynamic import means the server webpack never touches the Ably bundle.
 */

import dynamic from "next/dynamic";

const DuelRoomInner = dynamic(
  () => import("./DuelRoom").then((m) => m.DuelRoom),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-text-muted font-mono text-sm">Loading duel…</span>
      </div>
    ),
  }
);

export function DuelRoomLoader({ duelId }: { duelId: string }) {
  return <DuelRoomInner duelId={duelId} />;
}
