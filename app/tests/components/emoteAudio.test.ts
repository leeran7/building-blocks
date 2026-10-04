/**
 * Emote stings: every prop has a motif, nothing plays before a gesture
 * unlocked audio, and after one each sting schedules its notes.
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODELLED_PROPS } from "../../src/components/Duel/emotes3d/emoteModels";

class FakeParam {
  calls: string[] = [];
  value = 0;
  setValueAtTime(v: number) { this.calls.push(`set:${v}`); return this; }
  exponentialRampToValueAtTime(v: number) { this.calls.push(`ramp:${v}`); return this; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = "sine";
  started = 0;
  connect(n: FakeNode) { return n; }
  start() { this.started += 1; }
  stop() {}
}
const made: FakeNode[] = [];
class FakeContext {
  state = "running";
  currentTime = 1;
  destination = new FakeNode();
  createGain() { const n = new FakeNode(); made.push(n); return n; }
  createOscillator() { const n = new FakeNode(); made.push(n); return n; }
  resume() { return Promise.resolve(); }
}

beforeEach(() => {
  made.length = 0;
  vi.resetModules();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
});
afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("emote stings", () => {
  it("every modelled prop has a motif with at least two notes", async () => {
    const { emoteMotif } = await import("../../src/components/Duel/emoteAudio");
    for (const prop of MODELLED_PROPS) {
      const notes = emoteMotif(prop);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      for (const n of notes) {
        expect(n.freq).toBeGreaterThan(20);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });

  it("is silent before a gesture unlocked it, then plays each note", async () => {
    const { playEmoteSting, unlockEmoteAudio, emoteMotif } = await import("../../src/components/Duel/emoteAudio");
    playEmoteSting("rocket");
    expect(made).toHaveLength(0);
    unlockEmoteAudio();
    playEmoteSting("rocket");
    const oscillators = made.filter((n) => n.started > 0);
    expect(oscillators).toHaveLength(emoteMotif("rocket").length);
    // The rocket glides up: the first note ramps to a higher frequency.
    expect(oscillators[0].frequency.calls).toEqual(["set:220", "ramp:880"]);
  });
});
