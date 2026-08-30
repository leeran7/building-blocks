"use client";

/**
 * Power-up sound design — synthesised, not sampled.
 *
 * Every cue is generated with a couple of Web Audio oscillators, so the game
 * ships no audio assets, adds nothing to the bundle, and stays instant on a
 * cold load. Each power-up gets its own motif so it is identifiable with the
 * canvas off-screen: the ear should tell you what you grabbed.
 *
 * Nothing here touches the simulation — it is driven off the render-only
 * `lastPickupTick` / `lastPickupType` markers the sim stamps on the player.
 * Pickup now IS activation (power-ups fire the instant they're collected), so
 * that one marker covers both the "pickup" and "activate" cues.
 *
 * Autoplay: browsers refuse an AudioContext until a user gesture, so the
 * context is created lazily on the first cue (which always follows the Start
 * click) and resumed if the tab suspended it.
 */

import { PowerUpType } from "../../game/types";
import { createAudioOutput, type AudioOutput } from "./audioOutput";

export type Cue = "pickup" | "activate" | "expire";

/** One oscillator note in a motif. */
interface Note {
  /** Start offset from the cue, in seconds. */
  at: number;
  /** Base frequency in Hz. */
  freq: number;
  /** Glide target; omitted means a flat note. */
  to?: number;
  /** Length in seconds. */
  dur: number;
  wave?: OscillatorType;
  /** Peak gain, before the master volume. */
  gain?: number;
}

const MASTER_GAIN = 0.16;

/**
 * Activation motifs. Each shape mirrors what the power-up does, so the cue is
 * learnable rather than arbitrary: things that move you up glide up, sprint is a
 * fast clipped double-tap, and slow-lava sags downward.
 */
const ACTIVATE: Record<PowerUpType, Note[]> = {
  // Fast rising triad — "going up".
  "rapid-climb": [
    { at: 0, freq: 520, to: 780, dur: 0.1, wave: "triangle" },
    { at: 0.07, freq: 780, to: 1040, dur: 0.12, wave: "triangle" },
    { at: 0.16, freq: 1040, dur: 0.16, wave: "sine", gain: 0.8 },
  ],
  // Two clipped forward stabs — "dash dash".
  "sprint-burst": [
    { at: 0, freq: 300, to: 620, dur: 0.07, wave: "square", gain: 0.5 },
    { at: 0.09, freq: 380, to: 760, dur: 0.09, wave: "square", gain: 0.5 },
  ],
  // Two rising hops — "jump jump".
  "double-jump": [
    { at: 0, freq: 420, to: 700, dur: 0.09, wave: "triangle" },
    { at: 0.12, freq: 620, to: 980, dur: 0.11, wave: "triangle", gain: 0.75 },
  ],
  // Low swell — growing bigger.
  giant: [
    { at: 0, freq: 180, to: 280, dur: 0.14, wave: "sine" },
    { at: 0.08, freq: 220, to: 360, dur: 0.16, wave: "triangle", gain: 0.7 },
  ],
  // Engine burst — short low square/sawtooth chugs, not a launch sweep.
  jetpack: [
    { at: 0, freq: 88, dur: 0.055, wave: "square", gain: 0.5 },
    { at: 0.07, freq: 64, dur: 0.05, wave: "sawtooth", gain: 0.45 },
    { at: 0.13, freq: 96, dur: 0.06, wave: "square", gain: 0.4 },
  ],
  // Descending, detuned pair — the world winding down.
  "slow-lava": [
    { at: 0, freq: 660, to: 300, dur: 0.34, wave: "sine" },
    { at: 0.02, freq: 655, to: 297, dur: 0.34, wave: "sine", gain: 0.5 },
  ],
};

/** Pickup blips share one shape, pitched per type so each orb still sounds distinct. */
const PICKUP_PITCH: Record<PowerUpType, number> = {
  "rapid-climb": 880,
  "sprint-burst": 740,
  "double-jump": 990,
  giant: 320,
  jetpack: 260,
  "slow-lava": 620,
};

function pickupMotif(type: PowerUpType): Note[] {
  const f = PICKUP_PITCH[type];
  return [
    { at: 0, freq: f, dur: 0.05, wave: "triangle", gain: 0.55 },
    { at: 0.05, freq: f * 1.5, dur: 0.09, wave: "triangle", gain: 0.45 },
  ];
}

const EXPIRE: Note[] = [
  { at: 0, freq: 420, to: 240, dur: 0.16, wave: "sine", gain: 0.4 },
];

export class PowerUpAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private output: AudioOutput | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    // Create the graph even when muting so unmute is a gain change, not a
    // first-time context create outside a gesture.
    const ctx = this.ensureContext();
    if (this.master && ctx) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : MASTER_GAIN,
        ctx.currentTime,
        0.01
      );
    }
  }

  /** Call from a click/tap so WebKit will actually play later cues. */
  unlock(): void {
    this.ensureContext();
    this.output?.prime();
  }

  /** Release the audio device. Safe to call more than once. */
  dispose(): void {
    this.output?.dispose();
    this.output = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }

  /** @param delaySeconds Offsets this cue's start — lets a caller sequence two cues rather than layering them. */
  play(cue: Cue, type: PowerUpType, delaySeconds = 0): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const notes =
      cue === "pickup"
        ? pickupMotif(type)
        : cue === "activate"
        ? ACTIVATE[type]
        : EXPIRE;
    const now = ctx.currentTime + delaySeconds;
    for (const n of notes) this.playNote(ctx, this.master, n, now);
  }

  private playNote(
    ctx: AudioContext,
    dest: GainNode,
    n: Note,
    now: number
  ): void {
    const start = now + n.at;
    const end = start + n.dur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.wave ?? "sine";
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, n.to), end);
    }
    // Short attack then an exponential tail — a raw gate would click.
    const peak = n.gain ?? 0.6;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(dest);
    try {
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      osc.disconnect();
      gain.disconnect();
      return;
    }
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      // Route through a media element so iOS plays it over the Ring/Silent
      // switch instead of on the (switch-muted) ringer channel.
      this.output = createAudioOutput(this.ctx);
      this.master.connect(this.output.node);
    }
    // A context created before the first gesture starts suspended.
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }
}
