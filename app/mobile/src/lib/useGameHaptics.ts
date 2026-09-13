import { useEffect } from "react";
import type { MatchState, PowerUpType } from "@app/game/types";
import { tapLight, tapMedium } from "./haptics";

/**
 * Native taptic feedback for the core climb loop. Watches the authoritative
 * simulation state (not the interpolated render frame) each rAF and fires a
 * one-shot on the moments a player should *feel*:
 *
 *   - jump    launching off the ground   → light tap
 *   - land    touching down              → light tap, or a medium thud when the
 *              fall built up real speed
 *   - pickup  collecting a power-up      → medium tap, with a trailing light
 *              pulse for the punchier mobility/offense drops (mirrors the
 *              per-type audio cue)
 *   - jetpack holding thrust             → low light pulse so it feels continuous
 *   - ladder  climbing upward            → light tap, ratcheted rung-by-rung
 *
 * Lives in the native layer, never in the shared engine: the deterministic sim
 * stays pure (haptics would desync a re-simulated replay), and web play is
 * unaffected. Reads `simRef` (mutated in place by the sim's own loop) rather
 * than React state so events aren't lost to the ~10 Hz snapshot cadence.
 *
 * Known limit: this runs its own rAF and samples the latest tick, so a 1-tick
 * flicker batched inside a single hitched frame can be missed. Acceptable for
 * feedback — the discrete moments here (jump arcs, falls, pickups) span many
 * ticks. Impact strength uses the peak fall speed accumulated across the
 * airborne interval, NOT the land-tick vy (the sim zeroes vy the same tick it
 * grounds the player, so the instantaneous value is useless as an impact proxy).
 */

/** Peak downward speed (m/s) past which a landing thuds instead of ticks. Above
 *  a plain self-jump's return speed (jumpSpeed ~15-17) so ordinary hops stay light. */
const FALL_IMPACT_MS = 18;
/** Minimum gap between ladder rung ticks, so a fast climb ratchets rather than buzzes. */
const LADDER_TICK_MS = 140;
/** Cadence of the jetpack thrust rumble while jump is held. */
const THRUST_TICK_MS = 100;
/** Gap between the two pulses of a mobility-pickup double-tap. */
const PICKUP_DOUBLE_MS = 55;

/** Mobility/offense drops get the punchier double-tap; giant + slow-lava (defense
 *  /utility) get a single medium. Mirrors the offensive/defensive split the audio
 *  layer already draws from `lastPickupType`. */
const MOBILITY_PICKUPS: ReadonlySet<PowerUpType> = new Set<PowerUpType>([
  "rapid-climb",
  "sprint-burst",
  "super-jump",
  "jetpack",
]);

function firePickup(type: PowerUpType | null): void {
  void tapMedium();
  if (type !== null && MOBILITY_PICKUPS.has(type)) {
    setTimeout(() => void tapLight(), PICKUP_DOUBLE_MS);
  }
}

export function useGameHaptics(
  simRef: { readonly current: MatchState },
  slot: number,
  /** Changes when a new run begins (climb: runId; duel: duelId) so tracking resets. */
  runKey: string | number,
): void {
  useEffect(() => {
    // Per-run tracking of the watched player's last-seen fields. `prevOnGround`
    // is null until primed, so re-entering the climb phase never fires a
    // spurious land/jump off a stale baseline.
    let prevOnGround: boolean | null = null;
    let prevY = 0;
    let prevPickupTick: number | null = null;
    // Most-negative vy seen since leaving the ground — the true impact speed,
    // since the land tick itself reports vy already zeroed.
    let peakFallSpeed = 0;
    let lastLadderTs = 0;
    let lastThrustTs = 0;

    const reset = () => {
      prevOnGround = null;
      prevY = 0;
      prevPickupTick = null;
      peakFallSpeed = 0;
    };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);

      const s = simRef.current;
      if (s.phase !== "climb") {
        reset();
        return;
      }

      const p = s.players[slot];
      if (!p || p.status !== "climbing") return;

      // First climb frame: capture the baseline, emit nothing.
      if (prevOnGround === null) {
        prevOnGround = p.onGround;
        prevY = p.y;
        prevPickupTick = p.lastPickupTick;
        peakFallSpeed = 0;
        return;
      }

      // Power-up pickup — the sim stamps lastPickupTick/lastPickupType for
      // exactly this kind of one-shot presentation feedback.
      if (p.lastPickupTick !== prevPickupTick && p.lastPickupTick != null) {
        firePickup(p.lastPickupType);
      }

      // Jump — leaving the ground with upward velocity (walking off an edge has
      // vy <= 0 and correctly reads as a fall, not a jump).
      if (prevOnGround && !p.onGround && p.vy > 0) {
        void tapLight();
      }

      // Accumulate the fastest downward speed while airborne so the landing
      // thud reflects how far the player actually fell.
      if (!p.onGround && p.vy < peakFallSpeed) {
        peakFallSpeed = p.vy;
      }

      // Land — the payoff of a fall. Thud scales with the built-up fall speed;
      // small hops stay light.
      if (!prevOnGround && p.onGround) {
        if (-peakFallSpeed >= FALL_IMPACT_MS) void tapMedium();
        else void tapLight();
        peakFallSpeed = 0;
      }

      // Jetpack thrust — a low pulse while held so sustained thrust feels alive.
      if (p.jetpackThrusting) {
        const now = performance.now();
        if (now - lastThrustTs >= THRUST_TICK_MS) {
          lastThrustTs = now;
          void tapLight();
        }
      }

      // Ladder — a rung tick while actively climbing UP (vy > 0 excludes the
      // grab-snap tick, where the sim clamps y up onto the ladder before any climb).
      if (p.onLadder && p.vy > 0 && p.y > prevY) {
        const now = performance.now();
        if (now - lastLadderTs >= LADDER_TICK_MS) {
          lastLadderTs = now;
          void tapLight();
        }
      }

      prevOnGround = p.onGround;
      prevY = p.y;
      prevPickupTick = p.lastPickupTick;
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [simRef, slot, runKey]);
}
