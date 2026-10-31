import { describe, it, expect } from "vitest";
import {
  COUNTDOWN_MS,
  COUNTDOWN_TICKS,
  countdownNumeral,
  countdownNumeralAtMs,
  createMatch,
  stepMatch,
} from "../../src/game/simulation";
import { buildFreeTower } from "../../src/game/freeStack";

/** Each numeral in the order it first shows, and for how many ticks. */
function beatsOf(read: () => number | null, step: () => boolean) {
  const beats: { n: number; ticks: number }[] = [];
  do {
    const n = read();
    if (n === null) break;
    const last = beats[beats.length - 1];
    if (last?.n === n) last.ticks += 1;
    else beats.push({ n, ticks: 1 });
  } while (step());
  return beats;
}

describe("countdown numeral", () => {
  it("shows 3, 2 and 1 in turn over a real countdown, an equal beat each", () => {
    const m = createMatch({ seed: "seed-cd", mode: "solo", tower: buildFreeTower(), playerIds: ["p1"] });
    expect(m.phase).toBe("countdown");
    const beats = beatsOf(
      () => (m.phase === "countdown" ? countdownNumeral(m.tick) : null),
      () => {
        stepMatch(m, {});
        return true;
      },
    );
    expect(beats.map((b) => b.n)).toEqual([3, 2, 1]);
    for (const b of beats) expect(b.ticks).toBe(COUNTDOWN_TICKS / 3);
    expect(m.phase).toBe("climb");
  });

  it("the duel wall clock shows 3, 2, 1, then 0 at GO", () => {
    let ms = 0;
    const beats = beatsOf(
      () => (ms > COUNTDOWN_MS + 100 ? null : countdownNumeralAtMs(ms)),
      () => {
        ms += 10;
        return true;
      },
    );
    expect(beats.map((b) => b.n)).toEqual([3, 2, 1, 0]);
    // Negative elapsed (the start buffer before the countdown) reads 3.
    expect(countdownNumeralAtMs(-400)).toBe(3);
  });
});
