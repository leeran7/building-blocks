"use client";

/**
 * Climb music — a procedural, synth-only backing track.
 *
 * Like the power-up SFX, nothing is sampled: a lookahead scheduler walks a
 * looping chord progression, layering a soft pad, a plucked arpeggio, and a
 * driving bass out of a handful of oscillators. So the game still ships zero
 * audio assets and stays instant on a cold load.
 *
 * The track tightens as the lava closes in — setIntensity(0..1) opens a master
 * low-pass and lifts the bass, so the danger reads in the music, not just on
 * screen. One AudioContext, created lazily inside a user gesture (Start /
 * unmute) like the SFX engine; start()/stop() gate the scheduler and setMuted
 * rides the master gain so muting is instant and reversible.
 */

import { createAudioOutput, type AudioOutput } from "./audioOutput";

const MASTER_GAIN = 0.13;
const A3 = 220; // reference pitch; all notes are semitone offsets from here

/** semitone offset from A3 → frequency in Hz. */
const semi = (n: number) => A3 * Math.pow(2, n / 12);

interface Chord {
  /** Bass root, semitones from A3. */
  bass: number;
  /** Chord tones for the arpeggio, semitones from A3. */
  tones: number[];
}

// A-minor progression: Am – F – C – G (i – VI – III – VII). Driving but hopeful,
// which fits an endless upward climb.
const PROG: Chord[] = [
  { bass: -12, tones: [0, 3, 7] }, // Am : A  C  E
  { bass: -16, tones: [-4, 0, 3] }, // F  : F  A  C
  { bass: -9, tones: [3, 7, 10] }, // C  : C  E  G
  { bass: -14, tones: [-2, 2, 5] }, // G  : G  B  D
];

const TEMPO = 104; // bpm
const STEPS_PER_BEAT = 2; // eighth notes
const STEPS_PER_BAR = STEPS_PER_BEAT * 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds of audio scheduled past `now`

export class ClimbMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private output: AudioOutput | null = null;
  private muted = false;
  private playing = false;
  private intensity = 0;
  private step = 0;
  private nextStepTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
    // Only ride the gain if the graph already exists — never build an
    // AudioContext here. Restoring a saved "muted" preference runs at mount
    // (outside a user gesture); the flag is applied when ensureContext() later
    // builds the master gain, so muting stays silent and gesture-clean.
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : MASTER_GAIN,
        ctx.currentTime,
        0.02
      );
    }
  }

  /** 0..1 — how close the lava is. Opens the filter and firms up the bass. */
  setIntensity(v: number): void {
    const next = v < 0 ? 0 : v > 1 ? 1 : v;
    // Driven off per-frame lava proximity, so skip sub-perceptual changes rather
    // than schedule a filter ramp ~60×/s.
    if (Math.abs(next - this.intensity) < 0.01) return;
    this.intensity = next;
    const ctx = this.ctx;
    if (ctx && this.filter) {
      const cutoff = 700 + this.intensity * 3600;
      this.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.2);
    }
  }

  /** Create/resume the context inside a user gesture so cues will play. */
  unlock(): void {
    this.ensureContext();
    this.output?.prime();
  }

  /** Begin (or resume) the loop. Idempotent. */
  start(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.playing) return;
    // start() follows the Start-button unlock, but prime again in case music was
    // toggled on without a fresh unlock — harmless if already open.
    this.output?.prime();
    this.playing = true;
    // Start a hair in the future so the first bar isn't clipped.
    this.nextStepTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  /** Halt the loop but keep the context alive for a quick restart. */
  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Release the audio device. Safe to call more than once. */
  dispose(): void {
    this.stop();
    this.output?.dispose();
    this.output = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.filter = null;
  }

  /** Lookahead scheduler: emit every step that falls inside the window. */
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const stepDur = 60 / TEMPO / STEPS_PER_BEAT;
    // A backgrounded tab throttles setInterval, so nextStepTime can fall well
    // behind. Snap it back to the present rather than dump a burst of past-due
    // notes (all clamped to `now`) when the tab regains focus. The progression
    // continues from the running step, so the music just resumes.
    if (this.nextStepTime < ctx.currentTime - stepDur) {
      this.nextStepTime = ctx.currentTime + 0.06;
    }
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.step++;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const stepInBar = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
    const chord = PROG[Math.floor(step / STEPS_PER_BAR) % PROG.length];
    const barDur = (60 / TEMPO) * 4;

    // Pad: one sustained, detuned chord voice per bar.
    if (stepInBar === 0) this.pad(chord, t, barDur);

    // Bass: downbeat and the "and" of 3, with an extra ghost note when tense.
    if (stepInBar === 0 || stepInBar === 4) this.bass(chord.bass, t, 0.34);
    else if (stepInBar === 6 && this.intensity > 0.55) this.bass(chord.bass, t, 0.16);

    // Arpeggio: a plucked chord tone on every eighth, climbing then falling.
    const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
    const idx = ARP[stepInBar];
    const octave = stepInBar >= 4 ? 12 : 0; // lift the second half a register
    this.pluck(chord.tones[idx] + octave, t, 0.18);
  }

  private pad(chord: Chord, t: number, dur: number): void {
    if (!this.ctx || !this.filter) return;
    for (let i = 0; i < 2; i++) {
      const detune = i === 0 ? -5 : 5; // cents, for a wide slow shimmer
      const freq = semi(chord.tones[0]);
      this.voice(freq, "sine", t, dur * 0.98, 0.045, detune, 0.35);
    }
  }

  private bass(offset: number, t: number, dur: number): void {
    const gain = 0.11 + this.intensity * 0.06;
    this.voice(semi(offset), "triangle", t, dur, gain, 0, 0.008);
  }

  private pluck(offset: number, t: number, dur: number): void {
    this.voice(semi(offset), "triangle", t, dur, 0.05, 0, 0.004);
  }

  /** One enveloped oscillator note routed through the master filter chain. */
  private voice(
    freq: number,
    wave: OscillatorType,
    start: number,
    dur: number,
    peak: number,
    detune: number,
    attack: number
  ): void {
    const ctx = this.ctx;
    const dest = this.filter;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    const end = start + dur;
    // Exponential ramps never reach 0, so a raw gate would click.
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
      // Master gain → low-pass (opens with intensity) → speakers.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 700 + this.intensity * 3600;
      this.filter.Q.value = 0.7;
      // Route through a media element so iOS plays it over the Ring/Silent
      // switch instead of on the (switch-muted) ringer channel.
      this.output = createAudioOutput(this.ctx);
      this.filter.connect(this.master).connect(this.output.node);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }
}
