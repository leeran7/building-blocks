"use client";

/**
 * Emote stings, synthesised like the rest of the game's sound (powerUpAudio).
 *
 * Each prop has a two- or three-note motif that matches its shape: the rocket
 * glides up, the hourglass ticks, the swords clang. The context is created on
 * the first tap of the emote button (a gesture, so WebKit allows it); an
 * incoming emote plays only if that has happened, which is the same rule the
 * run-moment stings follow.
 */

import type { EmoteProp } from "../../net/emotes";

interface Note {
  at: number;
  freq: number;
  to?: number;
  dur: number;
  wave?: OscillatorType;
  gain?: number;
}

const MASTER_GAIN = 0.14;

const MOTIFS: Record<EmoteProp, Note[]> = {
  // Regal: a rising fourth and a shimmer.
  crown: [
    { at: 0, freq: 523, dur: 0.12, wave: "triangle" },
    { at: 0.11, freq: 698, dur: 0.22, wave: "triangle" },
    { at: 0.2, freq: 1397, dur: 0.3, wave: "sine", gain: 0.35 },
  ],
  // A hollow knock and a cackle.
  skull: [
    { at: 0, freq: 180, to: 90, dur: 0.14, wave: "square", gain: 0.5 },
    { at: 0.16, freq: 420, to: 330, dur: 0.08, wave: "sawtooth", gain: 0.35 },
    { at: 0.26, freq: 420, to: 330, dur: 0.08, wave: "sawtooth", gain: 0.35 },
    { at: 0.36, freq: 420, to: 300, dur: 0.1, wave: "sawtooth", gain: 0.35 },
  ],
  // Lift-off glide.
  rocket: [
    { at: 0, freq: 220, to: 880, dur: 0.38, wave: "sawtooth", gain: 0.45 },
    { at: 0.3, freq: 880, to: 1320, dur: 0.18, wave: "sine", gain: 0.5 },
  ],
  // A whoosh with a crackle on top.
  flame: [
    { at: 0, freq: 160, to: 320, dur: 0.3, wave: "sawtooth", gain: 0.4 },
    { at: 0.05, freq: 2400, to: 1800, dur: 0.06, wave: "square", gain: 0.12 },
    { at: 0.17, freq: 2600, to: 1900, dur: 0.06, wave: "square", gain: 0.12 },
  ],
  // A friendly two-note "yep".
  thumbs: [
    { at: 0, freq: 660, dur: 0.09, wave: "triangle" },
    { at: 0.1, freq: 990, dur: 0.18, wave: "triangle" },
  ],
  // Soft lub-dub.
  heart: [
    { at: 0, freq: 196, to: 150, dur: 0.12, wave: "sine", gain: 0.8 },
    { at: 0.2, freq: 220, to: 160, dur: 0.14, wave: "sine", gain: 0.6 },
  ],
  // Zap.
  bolt: [
    { at: 0, freq: 2200, to: 300, dur: 0.12, wave: "square", gain: 0.3 },
    { at: 0.03, freq: 90, to: 60, dur: 0.16, wave: "sawtooth", gain: 0.5 },
  ],
  // Tick, tock.
  hourglass: [
    { at: 0, freq: 1500, dur: 0.035, wave: "square", gain: 0.3 },
    { at: 0.26, freq: 1150, dur: 0.035, wave: "square", gain: 0.3 },
    { at: 0.52, freq: 1500, dur: 0.035, wave: "square", gain: 0.3 },
  ],
  // Steel on steel: a bright clang with a long ring.
  swords: [
    { at: 0.26, freq: 3100, to: 2900, dur: 0.05, wave: "square", gain: 0.3 },
    { at: 0.26, freq: 1870, to: 1860, dur: 0.6, wave: "triangle", gain: 0.3 },
    { at: 0.27, freq: 2480, to: 2470, dur: 0.45, wave: "sine", gain: 0.2 },
  ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

/** Call from a tap so later stings (incoming emotes included) are allowed to play. */
export function unlockEmoteAudio(): void {
  ensureContext();
}

/** Play the sting for `prop`. Silent until unlockEmoteAudio ran from a gesture. */
export function playEmoteSting(prop: EmoteProp): void {
  const c = ctx;
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const now = c.currentTime;
  for (const n of MOTIFS[prop]) {
    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = n.wave ?? "sine";
      osc.frequency.setValueAtTime(n.freq, now + n.at);
      if (n.to !== undefined) osc.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.dur);
      const peak = n.gain ?? 0.6;
      g.gain.setValueAtTime(0.0001, now + n.at);
      g.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      osc.connect(g).connect(master);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.02);
    } catch {
      /* a sting failing must never take the duel down */
    }
  }
}

/** Test seam: the notes a prop plays. */
export function emoteMotif(prop: EmoteProp): readonly Note[] {
  return MOTIFS[prop];
}
