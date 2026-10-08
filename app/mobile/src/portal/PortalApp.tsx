/**
 * The web-portal shell (CrazyGames, YouTube Playables, itch.io): straight onto
 * a menu with one Start button, endless Free Climb only, best height on the
 * device. No account, API, shop, duels, replays or links out.
 *
 * The target's config comes in as a prop rather than from `@target/config`,
 * so each portal root passes its own adapters and tests can pass fakes.
 */

import { useCallback, useEffect, useState } from "react";
import type { TargetConfig } from "../targets/types";
import { safely } from "./sdkGuard";
import { loadBest } from "./bestHeight";
import { PortalRun } from "./PortalRun";

export function PortalApp({ config }: { config: Pick<TargetConfig, "platform" | "ads"> }) {
  const { platform, ads } = config;
  const [best, setBest] = useState<number | null>(null);
  const [audioAllowed, setAudioAllowed] = useState(() => safely(() => platform.isAudioAllowed(), true));
  const [hostPaused, setHostPaused] = useState(false);

  // Boot. main.tsx already started init(); it is idempotent. Loading ends once
  // the menu has painted and takes input (two frames: commit, then paint).
  useEffect(() => {
    let cancelled = false;
    platform.loadingStart();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!cancelled) platform.loadingStop();
      });
    });
    void platform.init().then(() => {
      if (!cancelled) setAudioAllowed(safely(() => platform.isAudioAllowed(), true));
    });
    void loadBest(platform).then((saved) => {
      if (cancelled || saved === null) return;
      // A run may have finished before the save loaded: keep the higher.
      setBest((cur) => (cur === null ? saved : Math.max(cur, saved)));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [platform]);

  useEffect(() => platform.onAudioAllowedChange((allowed) => setAudioAllowed(allowed)), [platform]);
  useEffect(() => platform.onPauseChange((paused) => setHostPaused(paused)), [platform]);

  const onBest = useCallback((next: number) => {
    setBest((cur) => (cur === null ? next : Math.max(cur, next)));
  }, []);

  return (
    <PortalRun
      platform={platform}
      ads={ads}
      best={best}
      onBest={onBest}
      audioAllowed={audioAllowed}
      hostPaused={hostPaused}
    />
  );
}
