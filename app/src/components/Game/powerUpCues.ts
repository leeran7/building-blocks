/**
 * The pure half of the power-up (and world) feedback layer.
 *
 * `usePowerUpFeedback` used to hold all of this inline in a ref-driven effect,
 * which made two real defects invisible to the test suite — stale run state and
 * silently-dropped repeat announcements. The decision of *what* to say and play
 * is a function of the previous cue state and the current player, so it lives
 * here as a plain reducer; the hook is left with the parts that genuinely need
 * React and the Web Audio API.
 *
 * World cues (jetpack loop, lava-on-screen doom, death hit) follow the same
 * pattern: edges become one-shots, levels become loop flags the hook applies
 * every frame.
 */

import type { PowerUpType } from "../../game/types";
import { POWER_UP_SPECS } from "../../game/powerups";

/**
 * Folds one frame of player state into the cues to fire.
 *
 * Returns a new memo rather than mutating: the hook keeps it in a ref, and
 * tests thread it by hand.
 */
export function stepCues(
  memo: CueMemo,
  input: CueInput
): { memo: CueMemo; out: CueOutput } {
  const next: CueMemo = { ...memo };
  const sounds: CueSound[] = [];
  let pickupText: string | null = null;
  let expireText: string | null = null;
  let announcement: string | null = null;

  // A restart reuses the mounted component, so every carried-over marker has to
  // be dropped explicitly. Leaving `pickupTick` behind would swallow the new
  // run's first pickup whenever it landed on the same tick number, and leaving
  // `activeKey` behind would report the previous run's effects as having just
  // ended. Lava/death flags have to reset too — otherwise a new climb that
  // dies would stay silent (memo.dead still true) and a leftover lava-visible
  // flag would skip the "doom is coming" sting.
  if (input.runId !== next.runId) {
    next.runId = input.runId;
    next.pickupTick = null;
    next.activeKey = "";
    next.lavaOnScreen = false;
    next.dead = false;
    announcement = "";
  }

  if (
    input.lastPickupTick !== null &&
    input.lastPickupTick !== next.pickupTick &&
    input.lastPickupType
  ) {
    next.pickupTick = input.lastPickupTick;
    const spec = POWER_UP_SPECS[input.lastPickupType];
    // Pickup IS activation now — sequence both motifs (a delay long enough for
    // the pickup blip to finish, see pickupMotif's ~0.14s length) for a
    // "ding-whoosh" rather than layering them into a single muddy chord.
    sounds.push({ kind: "pickup", type: input.lastPickupType, delay: 0 });
    sounds.push({ kind: "activate", type: input.lastPickupType, delay: 0.13 });
    pickupText = `${spec.label} activated. ${spec.description}.`;
  }

  const activeKey = cueKey(input.activeTypes);
  if (activeKey !== next.activeKey) {
    const before = next.activeKey ? next.activeKey.split(",") : [];
    const ended = before.filter(
      (t) => !input.activeTypes.includes(t as PowerUpType)
    ) as PowerUpType[];
    next.activeKey = activeKey;
    if (ended.length > 0) {
      sounds.push({ kind: "expire", type: ended[0], delay: 0 });
      expireText = `${POWER_UP_SPECS[ended[0]].label} ended.`;
    }
  }

  // Death wins the frame: if doom already struck, skip the approaching sting
  // so the two motifs do not pile into one muddy chord.
  if (input.dead && !next.dead) {
    sounds.push({ kind: "death", delay: 0 });
  }
  next.dead = input.dead;

  if (!input.dead && input.lavaOnScreen && !next.lavaOnScreen) {
    sounds.push({ kind: "lava-sting", delay: 0 });
  }
  next.lavaOnScreen = input.lavaOnScreen;

  if (pickupText && expireText) {
    // Both can fire on one tick (sprint-burst ending as you grab the next
    // orb). A single live-region slot would keep only the last write.
    announcement = `${expireText} ${pickupText}`;
  } else {
    announcement = pickupText ?? expireText ?? announcement;
  }

  if (announcement) {
    // Assistive tech re-announces a live region when its text changes, so two
    // identical messages in a row — collecting the same power-up twice, a
    // common way to play — would be spoken once. An alternating zero-width
    // space makes consecutive repeats distinct strings without changing what
    // is rendered or read aloud.
    announcement += next.announceCount % 2 === 1 ? ZERO_WIDTH_SPACE : "";
    next.announceCount = memo.announceCount + 1;
  }

  const loops: CueLoops = input.dead
    ? { jetpack: false, lavaDoom: false, lavaFill: 0 }
    : {
        jetpack: input.jetpackThrusting,
        lavaDoom: input.lavaOnScreen,
        lavaFill: input.lavaFill,
      };

  return { memo: next, out: { sounds, loops, announcement } };
}

/** Cue state for a component that has not seen a frame yet. */
export function initialCueMemo(runId: number): CueMemo {
  return {
    runId,
    pickupTick: null,
    activeKey: "",
    announceCount: 0,
    lavaOnScreen: false,
    dead: false,
  };
}

/**
 * Stable identity for the live effect set.
 *
 * `stepMatch` mutates the player in place and the hook only ever sees shallow
 * clones, so the array reference is not a usable change signal.
 */
export function cueKey(types: readonly PowerUpType[]): string {
  return [...types].sort().join(",");
}

/**
 * Strips the repeat-announcement marker. Only tests and anything comparing
 * announcement text should need this — it is invisible when rendered.
 */
export function announcementText(announcement: string): string {
  return announcement.split(ZERO_WIDTH_SPACE).join("");
}

const ZERO_WIDTH_SPACE = "\u200b";

export type PowerCueKind = "pickup" | "activate" | "expire";
export type WorldCueKind = "lava-sting" | "death";
export type CueKind = PowerCueKind | WorldCueKind;

export interface PowerCueSound {
  kind: PowerCueKind;
  type: PowerUpType;
  /** Seconds to wait before playing, so motifs can be sequenced. */
  delay: number;
}

export type CueSound =
  | PowerCueSound
  | { kind: "lava-sting"; delay: number }
  | { kind: "death"; delay: number };

export interface CueLoops {
  jetpack: boolean;
  lavaDoom: boolean;
  /** 0..1 how much of the uncovered view the lava has eaten. */
  lavaFill: number;
}

export interface CueOutput {
  sounds: CueSound[];
  loops: CueLoops;
  /** New live-region text, or null to leave the current text alone. */
  announcement: string | null;
}

export interface CueMemo {
  runId: number;
  pickupTick: number | null;
  activeKey: string;
  announceCount: number;
  lavaOnScreen: boolean;
  dead: boolean;
}

export interface CueInput {
  runId: number;
  lastPickupTick: number | null;
  lastPickupType: PowerUpType | null;
  /** Types live *this* tick — expired entries already filtered out. */
  activeTypes: readonly PowerUpType[];
  jetpackThrusting: boolean;
  /** Lava line is in the uncovered (above overlay) view. */
  lavaOnScreen: boolean;
  lavaFill: number;
  dead: boolean;
}
