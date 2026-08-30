"use client";

/**
 * Game sound design — synthesised, not sampled.
 *
 * Every cue is generated with a couple of Web Audio oscillators, so the game
 * ships no audio assets, adds nothing to the bundle, and stays instant on a
 * cold load. Power-up motifs stay identifiable with the canvas off-screen;
 * world loops (jetpack thrust, lava doom) and the death hit sit on the same
 * graph so mute / iOS routing / gesture unlock stay one code path.
 *
 * Nothing here touches the simulation — it is driven off the render-only
 * markers the sim stamps on the player, plus camera-space lava fill.
 *
 * Autoplay: browsers refuse an AudioContext until a user gesture, so the
 * context is created lazily on the first cue (which always follows the Start
 * click) and resumed if the tab suspended it. Loop graphs are not created
 * from setMuted / setJetpack / setLavaDoom when no context exists yet —
 * restoring a saved mute preference runs at mount, outside a gesture.
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
  /** Attack in seconds; default is a clickless 8 ms. */
  attack?: number;
}

const MASTER_GAIN = 0.16;

/**
 * The doom interval: F#1 + C2, a tritone. "Doom is coming" swells it in;
 * "doom struck" slams the same pair and drops.
 */
const DOOM_ROOT_HZ = 46.25;
const DOOM_TRITONE_HZ = DOOM_ROOT_HZ * Math.pow(2, 6 / 12);

/** Exported so tests can assert coming vs struck without grepping motifs. */
export const LAVA_STING_ATTACK = 0.28;
export const LAVA_STING_PEAK = 0.58;
export const DEATH_HIT_ATTACK = 0.006;
export const DEATH_HIT_PEAK = 0.95;

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

/** Slow descending tritone — doom is coming. Attack is long on purpose. */
const LAVA_STING: Note[] = [
  {
    at: 0,
    freq: DOOM_ROOT_HZ * 2,
    to: DOOM_ROOT_HZ,
    dur: 1.15,
    wave: "sine",
    gain: LAVA_STING_PEAK,
    attack: LAVA_STING_ATTACK,
  },
  {
    at: 0.04,
    freq: DOOM_TRITONE_HZ * 2,
    to: DOOM_TRITONE_HZ,
    dur: 1.2,
    wave: "sine",
    gain: LAVA_STING_PEAK * 0.78,
    attack: LAVA_STING_ATTACK,
  },
  {
    at: 0.55,
    freq: DOOM_ROOT_HZ,
    dur: 0.7,
    wave: "triangle",
    gain: 0.4,
    attack: 0.08,
  },
];

/** Instant slam of the same interval, then a sub drop — doom struck. */
const DEATH_HIT: Note[] = [
  {
    at: 0,
    freq: 90,
    to: 22,
    dur: 1.45,
    wave: "sawtooth",
    gain: DEATH_HIT_PEAK,
    attack: DEATH_HIT_ATTACK,
  },
  {
    at: 0,
    freq: DOOM_ROOT_HZ,
    dur: 1.8,
    wave: "sine",
    gain: 0.85,
    attack: DEATH_HIT_ATTACK,
  },
  {
    at: 0,
    freq: DOOM_TRITONE_HZ,
    dur: 1.6,
    wave: "triangle",
    gain: 0.7,
    attack: DEATH_HIT_ATTACK,
  },
  {
    at: 0,
    freq: 210,
    dur: 0.05,
    wave: "square",
    gain: 0.45,
    attack: 0.002,
  },
];

export class PowerUpAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private output: AudioOutput | null = null;
  private muted = false;

  private jetWanted = false;
  private jetGain: GainNode | null = null;
  private jetSources: AudioScheduledSourceNode[] = [];
  private jetApplied = false;

  private lavaWanted = false;
  private lavaFillWanted = 0;
  private lavaGain: GainNode | null = null;
  private lavaLfo: OscillatorNode | null = null;
  private lavaSources: AudioScheduledSourceNode[] = [];
  private lavaAppliedOn = false;
  private lavaAppliedFill = -1;

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
    this.applyWantedLoops();
  }

  /** Release the audio device. Safe to call more than once. */
  dispose(): void {
    this.stopSources(this.jetSources);
    this.stopSources(this.lavaSources);
    this.jetSources = [];
    this.lavaSources = [];
    this.jetGain = null;
    this.lavaGain = null;
    this.lavaLfo = null;
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

  /** Hold-to-thrust loop. Idempotent; gain-gates a running graph. */
  setJetpackThrusting(on: boolean): void {
    this.jetWanted = on;
    this.applyJetGain();
  }

  /**
   * Lava-on-screen rumble. `fill` (0..1) is how much of the uncovered view
   * the lava has eaten — the drone is a whisper at a sliver and a roar at
   * full screen. Does not create an AudioContext (mount-safe).
   */
  setLavaDoom(on: boolean, fill: number): void {
    const next = fill < 0 ? 0 : fill > 1 ? 1 : fill;
    this.lavaWanted = on;
    this.lavaFillWanted = next;
    this.applyLavaGain();
  }

  playLavaSting(delaySeconds = 0): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime + delaySeconds;
    for (const n of LAVA_STING) this.playNote(ctx, this.master, n, now);
    this.playNoiseBurst(ctx, this.master, now, 0.9, 0.22, 180);
  }

  playDeath(delaySeconds = 0): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    // Duck the loops under the hit so thrust/rumble do not sit on the slam.
    this.jetWanted = false;
    this.lavaWanted = false;
    this.lavaFillWanted = 0;
    this.applyJetGain();
    this.applyLavaGain();
    const now = ctx.currentTime + delaySeconds;
    for (const n of DEATH_HIT) this.playNote(ctx, this.master, n, now);
    this.playNoiseBurst(ctx, this.master, now, 0.4, 0.7, 900);
  }

  private applyWantedLoops(): void {
    this.applyJetGain();
    this.applyLavaGain();
  }

  private applyJetGain(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.jetWanted && !this.jetGain) {
      this.jetApplied = false;
      return;
    }
    if (this.jetWanted === this.jetApplied && this.jetGain) return;
    try {
      this.ensureJetGraph(ctx);
      if (!this.jetGain) return;
      const peak = jetpackLoopGain(this.jetWanted);
      this.jetGain.gain.setTargetAtTime(
        Math.max(0.0001, peak),
        ctx.currentTime,
        this.jetWanted ? 0.03 : 0.05
      );
      this.jetApplied = this.jetWanted;
    } catch {
      /* InvalidStateError must not unmount the game */
    }
  }

  private applyLavaGain(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.lavaWanted && !this.lavaGain) {
      this.lavaAppliedOn = false;
      this.lavaAppliedFill = this.lavaFillWanted;
      return;
    }
    const fillChanged =
      Math.abs(this.lavaFillWanted - this.lavaAppliedFill) >= 0.01;
    if (this.lavaWanted === this.lavaAppliedOn && !fillChanged && this.lavaGain) {
      return;
    }
    try {
      this.ensureLavaGraph(ctx);
      if (!this.lavaGain) return;
      const peak = lavaDoomLoopGain(this.lavaWanted ? this.lavaFillWanted : 0);
      this.lavaGain.gain.setTargetAtTime(
        Math.max(0.0001, peak),
        ctx.currentTime,
        0.12
      );
      if (this.lavaLfo) {
        const rate = 0.85 + this.lavaFillWanted * 2.1;
        this.lavaLfo.frequency.setTargetAtTime(
          this.lavaWanted ? rate : 0.85,
          ctx.currentTime,
          0.2
        );
      }
      this.lavaAppliedOn = this.lavaWanted;
      this.lavaAppliedFill = this.lavaFillWanted;
    } catch {
      /* InvalidStateError must not unmount the game */
    }
  }

  private ensureJetGraph(ctx: AudioContext): void {
    if (this.jetGain || !this.master) return;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 920;
    band.Q.value = 0.85;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 280;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.55;

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 78;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.28;

    const pulse = ctx.createOscillator();
    pulse.type = "square";
    pulse.frequency.value = 49;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.16;

    const out = ctx.createGain();
    out.gain.value = 0.0001;

    noise.connect(high).connect(band).connect(noiseGain).connect(out);
    saw.connect(sawGain).connect(out);
    pulse.connect(pulseGain).connect(out);
    out.connect(this.master);

    try {
      noise.start();
      saw.start();
      pulse.start();
    } catch {
      this.stopSources([noise, saw, pulse]);
      out.disconnect();
      return;
    }
    this.jetSources = [noise, saw, pulse];
    this.jetGain = out;
  }

  private ensureLavaGraph(ctx: AudioContext): void {
    if (this.lavaGain || !this.master) return;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 160;
    low.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.7;

    const root = ctx.createOscillator();
    root.type = "sine";
    root.frequency.value = DOOM_ROOT_HZ;
    const rootGain = ctx.createGain();
    rootGain.gain.value = 0.55;

    const tri = ctx.createOscillator();
    tri.type = "sine";
    tri.frequency.value = DOOM_TRITONE_HZ;
    const triGain = ctx.createGain();
    triGain.gain.value = 0.42;

    const rumble = ctx.createGain();
    rumble.gain.value = 0.0001;

    const heartbeat = ctx.createGain();
    heartbeat.gain.value = 0.78;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.85;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.22;
    lfo.connect(lfoDepth).connect(heartbeat.gain);

    noise.connect(low).connect(noiseGain).connect(rumble);
    root.connect(rootGain).connect(rumble);
    tri.connect(triGain).connect(rumble);
    rumble.connect(heartbeat).connect(this.master);

    try {
      noise.start();
      root.start();
      tri.start();
      lfo.start();
    } catch {
      this.stopSources([noise, root, tri, lfo]);
      rumble.disconnect();
      heartbeat.disconnect();
      return;
    }
    this.lavaSources = [noise, root, tri, lfo];
    this.lavaGain = rumble;
    this.lavaLfo = lfo;
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
    const attack = n.attack ?? 0.008;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
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

  private playNoiseBurst(
    ctx: AudioContext,
    dest: GainNode,
    now: number,
    dur: number,
    peak: number,
    cutoff: number
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(gain).connect(dest);
    try {
      src.start(now);
      src.stop(now + dur + 0.02);
    } catch {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    }
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private stopSources(nodes: AudioScheduledSourceNode[]): void {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
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

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.9));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Peak loop gain (pre-master) while the jetpack is thrusting. */
export function jetpackLoopGain(on: boolean): number {
  return on ? 0.58 : 0;
}

/**
 * Peak rumble gain (pre-master) from how much of the uncovered view lava
 * has eaten. Zero at no lava; a whisper at the first sliver so the sting
 * can lead; a roar when the view is full.
 */
export function lavaDoomLoopGain(fill: number): number {
  const f = fill < 0 ? 0 : fill > 1 ? 1 : fill;
  if (f <= 0) return 0;
  return 0.16 + f * 0.62;
}
