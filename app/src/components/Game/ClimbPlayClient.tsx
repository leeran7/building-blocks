"use client";

/**
 * Client wrapper for /play — loads an optional shared replay from ?r=.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClimbScene } from "../../components/Game/ClimbScene";
import { ClimbControlsGuide } from "../../components/Game/ClimbControlsGuide";
import { decodeRunReplay, type RunReplay } from "../../game/runReplay";
import { buildFreeTower } from "../../game/freeStack";

interface ClimbPlayClientProps {
  replayToken: string | null;
}

export function ClimbPlayClient({ replayToken }: ClimbPlayClientProps) {
  const tower = buildFreeTower();
  const [replay, setReplay] = useState<RunReplay | null>(null);
  const [replayError, setReplayError] = useState(false);
  const [loadingReplay, setLoadingReplay] = useState(Boolean(replayToken));

  useEffect(() => {
    if (!replayToken) {
      setLoadingReplay(false);
      return;
    }
    let cancelled = false;
    decodeRunReplay(replayToken)
      .then((decoded) => {
        if (cancelled) return;
        if (!decoded) {
          setReplayError(true);
          return;
        }
        setReplay(decoded);
      })
      .catch(() => {
        if (!cancelled) setReplayError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingReplay(false);
      });
    return () => {
      cancelled = true;
    };
  }, [replayToken]);

  if (loadingReplay) {
    return (
      <PlayShell>
        <p className="text-text-muted text-sm text-center font-mono">
          Loading replay…
        </p>
      </PlayShell>
    );
  }

  if (replayError) {
    return (
      <PlayShell>
        <div className="text-center space-y-3">
          <p className="text-text-secondary text-sm">
            That replay link is invalid or expired.
          </p>
          <Link
            href="/play"
            className="text-accent underline underline-offset-4 text-sm"
          >
            Play a new climb →
          </Link>
        </div>
      </PlayShell>
    );
  }

  return (
    <PlayShell>
      <ClimbScene
        tower={tower}
        categoryLabel={replay ? "Shared replay" : "Free climb"}
        replay={replay}
      />
    </PlayShell>
  );
}

function PlayShell({
  children,
}: {
  children: ReactNode;
}) {
  // The canvas is aspect-locked 9:16 and sized by useCanvasSize from the width its
  // PARENT gives it, so it MUST keep a full-width (height-constrained) parent — a
  // side-by-side layout that width-constrains the canvas column collapses it to a
  // short, narrow strip. So the canvas stays centered here at its full,
  // height-derived size, identical to the pre-layout-pass baseline (never shrunk,
  // lobby overlay still fits with no HUD overlap). To use more of the desktop width
  // and shrink the empty black margins, the content-rich how-to/controls card below
  // it is widened (max-w-lg -> max-w-3xl) rather than squeezed beside the stage.
  // Touch is unaffected: ClimbScene goes `fixed inset-0` on coarse pointers.
  return (
    <div className="flex flex-col items-center gap-6">
      {children}
      <div className="w-full max-w-3xl">
        <p className="text-text-secondary text-sm mb-4 text-center">
          Endless climb — go as high as you can. Your peak height is your score
          on the{" "}
          <Link href="/climb" className="text-accent underline underline-offset-2">
            free leaderboard
          </Link>
          .
        </p>
        <ClimbControlsGuide />
      </div>
    </div>
  );
}
