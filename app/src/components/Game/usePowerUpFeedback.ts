"use client";

/**
 * Drives the power-up sound cues, world loops (jetpack / lava doom), and the
 * screen-reader announcements from the simulation state.
 *
 * The sim is pure, so this watches the render-only marker it stamps on the
 * player (`lastPickupTick`) — pickup and activation are the same event now,
 * since a power-up fires the instant they're collected — plus the set of live
 * effects, jetpack thrust, lava-on-screen fill, and death, and fires a
 * one-shot cue whenever one of them edges.
 *
 * What to say and play is decided by `stepCues`. The hook owns the Web Audio
 * graph, the mute preference, and the live-region string.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerState, PowerUpType } from "../../game/types";
import { isExpired } from "../../game/powerups";
import { PowerUpAudio } from "./powerUpAudio";
import { ClimbMusic } from "./climbMusic";
import { initialCueMemo, stepCues, type CueMemo } from "./powerUpCues";

const MUTE_KEY = "doomstack:sfx-muted";

export function usePowerUpFeedback(
  player: PlayerState | undefined,
  tick: number,
  runId: number,
  music?: MusicControl,
  world?: WorldAudio
): PowerUpFeedback {
  const audioRef = useRef<PowerUpAudio | null>(null);
  if (audioRef.current === null) audioRef.current = new PowerUpAudio();
  const audio = audioRef.current;

  const musicRef = useRef<ClimbMusic | null>(null);
  if (musicRef.current === null) musicRef.current = new ClimbMusic();
  const musicEngine = musicRef.current;

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
      musicEngine.setMuted(true);
    }
  }, [audio, musicEngine]);

  useEffect(
    () => () => {
      audio.dispose();
      musicEngine.dispose();
    },
    [audio, musicEngine]
  );

  // Read option objects into primitives so the effects below depend on the
  // values, not the caller's fresh-every-render options object.
  const musicEnabled = music !== undefined;
  const musicActive = music?.active ?? false;
  const musicIntensity = music?.intensity ?? 0;
  const jetpackThrusting = world?.jetpackThrusting ?? false;
  const lavaOnScreen = world?.lavaOnScreen ?? false;
  const lavaFill = world?.lavaFill ?? 0;
  const dead = world?.dead ?? false;

  // Start/stop the backing track with the run, and keep its intensity in step
  // with how close the lava is.
  useEffect(() => {
    if (!musicEnabled) return;
    if (musicActive) musicEngine.start();
    else musicEngine.stop();
  }, [musicEnabled, musicActive, musicEngine]);

  useEffect(() => {
    if (musicEnabled) musicEngine.setIntensity(musicIntensity);
  }, [musicEnabled, musicIntensity, musicEngine]);

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
      jetpackThrusting,
      lavaOnScreen,
      lavaFill,
      dead,
    });
    memoRef.current = memo;
    for (const sound of out.sounds) {
      try {
        if (sound.kind === "death") audio.playDeath(sound.delay);
        else if (sound.kind === "lava-sting") audio.playLavaSting(sound.delay);
        else audio.play(sound.kind, sound.type, sound.delay);
      } catch {
        /* InvalidStateError must not unmount the game */
      }
    }
    try {
      audio.setJetpackThrusting(out.loops.jetpack);
      audio.setLavaDoom(out.loops.lavaDoom, out.loops.lavaFill);
    } catch {
      /* same */
    }
    if (out.announcement !== null) setAnnouncementText(out.announcement);
  }, [
    player,
    activeTypes,
    audio,
    runId,
    jetpackThrusting,
    lavaOnScreen,
    lavaFill,
    dead,
  ]);

  return {
    muted,
    setMuted: (next: boolean) => {
      setMutedState(next);
      audio.setMuted(next);
      musicEngine.setMuted(next);
      if (!next) {
        audio.unlock();
        musicEngine.unlock();
      }
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
    announcement,
    unlockAudio: () => {
      audio.unlock();
      musicEngine.unlock();
    },
  };
}

/** Optional backing-music control. `active` gates the loop (a run is underway);
 *  `intensity` (0..1) is how close the lava is, which tightens the track. */
export interface MusicControl {
  active: boolean;
  intensity: number;
}

/** World SFX driven off camera-space lava fill and player flags. */
export interface WorldAudio {
  jetpackThrusting: boolean;
  lavaOnScreen: boolean;
  lavaFill: number;
  dead: boolean;
}

export interface PowerUpFeedback {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /** Polite live-region text describing the most recent power-up event. */
  announcement: string;
  /** Create/resume the AudioContext inside a user gesture (Start, unmute). */
  unlockAudio: () => void;
}
