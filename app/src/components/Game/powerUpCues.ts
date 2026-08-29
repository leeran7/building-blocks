/**
 * The pure half of the power-up feedback layer.
 *
 * `usePowerUpFeedback` used to hold all of this inline in a ref-driven effect,
 * which made two real defects invisible to the test suite — stale run state and
 * silently-dropped repeat announcements. The decision of *what* to say and play
 * is a function of the previous cue state and the current player, so it lives
 * here as a plain reducer; the hook is left with the parts that genuinely need
 * React and the Web Audio API.
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
  let announcement: string | null = null;

  // A restart reuses the mounted component, so every carried-over marker has to
  // be dropped explicitly. Leaving `pickupTick` behind would swallow the new
  // run's first pickup whenever it landed on the same tick number, and leaving
  // `activeKey` behind would report the previous run's effects as having just
  // ended.
  if (input.runId !== next.runId) {
    next.runId = input.runId;
    next.pickupTick = null;
    next.activeKey = "";
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
    announcement = `${spec.label} activated. ${spec.description}.`;
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
      announcement = `${POWER_UP_SPECS[ended[0]].label} ended.`;
    }
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

  return { memo: next, out: { sounds, announcement } };
}

/** Cue state for a component that has not seen a frame yet. */
export function initialCueMemo(runId: number): CueMemo {
  return { runId, pickupTick: null, activeKey: "", announceCount: 0 };
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

export type CueKind = "pickup" | "activate" | "expire";

export interface CueSound {
  kind: CueKind;
  type: PowerUpType;
  /** Seconds to wait before playing, so motifs can be sequenced. */
  delay: number;
}

export interface CueOutput {
  sounds: CueSound[];
  /** New live-region text, or null to leave the current text alone. */
  announcement: string | null;
}

export interface CueMemo {
  runId: number;
  pickupTick: number | null;
  activeKey: string;
  announceCount: number;
}

export interface CueInput {
  runId: number;
  lastPickupTick: number | null;
  lastPickupType: PowerUpType | null;
  /** Types live *this* tick — expired entries already filtered out. */
  activeTypes: readonly PowerUpType[];
}
