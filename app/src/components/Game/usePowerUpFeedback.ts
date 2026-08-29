"use client";

/**
 * Drives the power-up sound cues and the screen-reader announcements from the
 * simulation state.
 *
 * The sim is pure, so this watches the render-only marker it stamps on the
 * player (`lastPickupTick`) — pickup and activation are the same event now,
 * since a power-up fires the instant it's collected — plus the set of live
 * effects, and fires a one-shot cue whenever one of them changes.
 *
 * What to say and play is decided by `stepCues`. The hook owns the Web Audio
 * graph, the mute preference, and the live-region string.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerState, PowerUpType } from "../../game/types";
import { isExpired } from "../../game/powerups";
import { PowerUpAudio } from "./powerUpAudio";
import { initialCueMemo, stepCues, type CueMemo } from "./powerUpCues";

const MUTE_KEY = "doomstack:sfx-muted";

export function usePowerUpFeedback(
  player: PlayerState | undefined,
  tick: number,
  runId: number
): PowerUpFeedback {
  const audioRef = useRef<PowerUpAudio | null>(null);
  if (audioRef.current === null) audioRef.current = new PowerUpAudio();
  const audio = audioRef.current;

  const [muted, setMutedState] = useState(false);
  const [announcement, setAnnouncementText] = useState("");
  const memoRef = useRef<CueMemo>(initialCueMemo(runId));

  // Restore the saved preference before the first cue can play.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MUTE_KEY);
    } catch {
      return;
    }
    if (saved === "1") {
      setMutedState(true);
      audio.setMuted(true);
    }
  }, [audio]);

  useEffect(() => () => audio.dispose(), [audio]);

  const activeTypes = useMemo((): readonly PowerUpType[] => {
    if (!player) return [];
    return player.activePowerUps
      .filter((a) => !isExpired(a, tick))
      .map((a) => a.type);
  }, [player, tick]);

  useEffect(() => {
    const { memo, out } = stepCues(memoRef.current, {
      runId,
      lastPickupTick: player?.lastPickupTick ?? null,
      lastPickupType: player?.lastPickupType ?? null,
      activeTypes,
    });
    memoRef.current = memo;
    for (const sound of out.sounds) {
      audio.play(sound.kind, sound.type, sound.delay);
    }
    if (out.announcement !== null) setAnnouncementText(out.announcement);
  }, [player, activeTypes, audio, runId]);

  return {
    muted,
    setMuted: (next: boolean) => {
      setMutedState(next);
      audio.setMuted(next);
      if (!next) audio.unlock();
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
    announcement,
    unlockAudio: () => audio.unlock(),
  };
}

export interface PowerUpFeedback {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Polite live-region text describing the most recent power-up event. */
  announcement: string;
  /** Create/resume the AudioContext inside a user gesture (Start, unmute). */
  unlockAudio: () => void;
}
