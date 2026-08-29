"use client";

/**
 * Drives the power-up sound cues and the screen-reader announcements from the
 * simulation state.
 *
 * The sim is pure, so this watches the render-only markers it stamps on the
 * player (`lastPickupTick`, `lastActivationTick`) plus the set of live effects,
 * and fires a one-shot cue whenever one of them changes. Effects are compared as
 * a joined string rather than by array identity: `stepMatch` mutates the player
 * in place and the hook only ever sees shallow clones, so the array reference is
 * not a reliable change signal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerState, PowerUpType } from "../../game/types";
import { POWER_UP_SPECS, isExpired } from "../../game/powerups";
import { PowerUpAudio } from "./powerUpAudio";

const MUTE_KEY = "doomstack:sfx-muted";

export interface PowerUpFeedback {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Polite live-region text describing the most recent power-up event. */
  announcement: string;
}

export function usePowerUpFeedback(
  player: PlayerState | undefined,
  tick: number
): PowerUpFeedback {
  const audioRef = useRef<PowerUpAudio | null>(null);
  if (audioRef.current === null) audioRef.current = new PowerUpAudio();
  const audio = audioRef.current;

  const [muted, setMutedState] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const prevPickupTick = useRef<number | null>(null);
  const prevActivationTick = useRef<number | null>(null);
  const prevActiveKey = useRef("");

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

  const activeKey = useMemo(() => {
    if (!player) return "";
    return player.activePowerUps
      .filter((a) => !isExpired(a, tick))
      .map((a) => a.type)
      .sort()
      .join(",");
  }, [player, tick]);

  useEffect(() => {
    if (!player) return;

    if (
      player.lastPickupTick !== null &&
      player.lastPickupTick !== prevPickupTick.current &&
      player.lastPickupType
    ) {
      prevPickupTick.current = player.lastPickupTick;
      const spec = POWER_UP_SPECS[player.lastPickupType];
      audio.play("pickup", player.lastPickupType);
      setAnnouncement(`${spec.label} collected. Press E to use: ${spec.description}.`);
    }

    if (
      player.lastActivationTick !== null &&
      player.lastActivationTick !== prevActivationTick.current &&
      player.lastActivationType
    ) {
      prevActivationTick.current = player.lastActivationTick;
      const spec = POWER_UP_SPECS[player.lastActivationType];
      audio.play("activate", player.lastActivationType);
      setAnnouncement(`${spec.label} active. ${spec.description}.`);
    }

    const prev = prevActiveKey.current;
    if (activeKey !== prev) {
      const before = prev ? prev.split(",") : [];
      const after = activeKey ? activeKey.split(",") : [];
      const ended = before.filter((t) => !after.includes(t)) as PowerUpType[];
      prevActiveKey.current = activeKey;
      if (ended.length > 0) {
        audio.play("expire", ended[0]);
        setAnnouncement(`${POWER_UP_SPECS[ended[0]].label} ended.`);
      }
    }
  }, [player, activeKey, audio]);

  return {
    muted,
    setMuted: (next: boolean) => {
      setMutedState(next);
      audio.setMuted(next);
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
    announcement,
  };
}
