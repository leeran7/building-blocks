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
  return (
    <div className="flex flex-col items-center gap-6">
      {children}
      <div className="w-full max-w-lg">
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
